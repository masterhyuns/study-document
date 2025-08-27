# 📊 Elasticsearch 모니터링 완벽 가이드

## 🎯 목표

Elasticsearch 클러스터의 상태를 실시간으로 모니터링하고 문제를 사전에 감지합니다.

## 🔍 모니터링 아키텍처

### 모니터링 스택 구성

```
┌─────────────────────────────────────────────────────────┐
│                   모니터링 아키텍처                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐     ┌──────────────┐                 │
│  │ Elasticsearch│────▶│  Metricbeat  │                 │
│  │   Cluster    │     │              │                 │
│  └──────────────┘     └──────┬───────┘                 │
│                               │                         │
│  ┌──────────────┐     ┌──────▼───────┐                 │
│  │   Filebeat   │────▶│ Logstash/    │                 │
│  │              │     │ Ingest Node  │                 │
│  └──────────────┘     └──────┬───────┘                 │
│                               │                         │
│                       ┌──────▼───────┐                 │
│                       │  Monitoring  │                 │
│                       │Elasticsearch │                 │
│                       └──────┬───────┘                 │
│                               │                         │
│                       ┌──────▼───────┐                 │
│                       │    Kibana    │                 │
│                       │  Dashboard   │                 │
│                       └──────────────┘                 │
└─────────────────────────────────────────────────────────┘
```

## 📈 Metricbeat 설정

### Metricbeat 구성

```yaml
# metricbeat.yml
metricbeat.config.modules:
  path: ${path.config}/modules.d/*.yml
  reload.enabled: true
  reload.period: 10s

# Elasticsearch 모듈
metricbeat.modules:
- module: elasticsearch
  xpack.enabled: true
  period: 10s
  hosts: ["http://localhost:9200"]
  username: "elastic"
  password: "changeme"
  ssl.enabled: true
  ssl.certificate_authorities: ["/etc/elasticsearch/certs/ca.crt"]
  
  # 수집할 메트릭
  metricsets:
    - ccr
    - cluster_stats
    - enrich
    - index
    - index_recovery
    - index_summary
    - ml_job
    - node
    - node_stats
    - pending_tasks
    - shard
    - snapshot

# System 모듈
- module: system
  period: 10s
  metricsets:
    - cpu
    - load
    - memory
    - network
    - process
    - process_summary
    - socket_summary
    - filesystem
    - fsstat
    - diskio
  process.include_top_n:
    by_cpu: 5
    by_memory: 5
  
# Docker 모듈 (컨테이너 환경)
- module: docker
  metricsets:
    - container
    - cpu
    - diskio
    - healthcheck
    - info
    - memory
    - network
  hosts: ["unix:///var/run/docker.sock"]
  period: 10s

# 출력 설정
output.elasticsearch:
  hosts: ["localhost:9200"]
  index: "metricbeat-%{[agent.version]}-%{+yyyy.MM.dd}"
  username: "elastic"
  password: "changeme"
  
# 인덱스 템플릿
setup.template.name: "metricbeat"
setup.template.pattern: "metricbeat-*"
setup.template.settings:
  index.number_of_shards: 1
  index.number_of_replicas: 1

# Kibana 대시보드
setup.kibana:
  host: "localhost:5601"
  username: "elastic"
  password: "changeme"

# 로깅
logging.level: info
logging.to_files: true
logging.files:
  path: /var/log/metricbeat
  name: metricbeat
  keepfiles: 7
  permissions: 0640
```

## 📝 로그 수집 (Filebeat)

### Filebeat 설정

```yaml
# filebeat.yml
filebeat.inputs:
# Elasticsearch 로그
- type: log
  enabled: true
  paths:
    - /var/log/elasticsearch/*.log
  multiline.pattern: '^\[[0-9]{4}-[0-9]{2}-[0-9]{2}'
  multiline.negate: true
  multiline.match: after
  fields:
    service: elasticsearch
    environment: production
  
# Slow log
- type: log
  enabled: true
  paths:
    - /var/log/elasticsearch/*_index_search_slowlog.log
    - /var/log/elasticsearch/*_index_indexing_slowlog.log
  json.keys_under_root: true
  json.add_error_key: true
  fields:
    type: slowlog

# GC 로그
- type: log
  enabled: true
  paths:
    - /var/log/elasticsearch/gc.log*
  multiline.pattern: '^\[[0-9]{4}'
  multiline.negate: true
  multiline.match: after
  fields:
    type: gc_log

# 프로세서
processors:
  - add_host_metadata:
      when.not.contains:
        tags: forwarded
  - add_docker_metadata: ~
  - add_kubernetes_metadata: ~
  
  # 로그 파싱
  - dissect:
      tokenizer: "[%{timestamp}][%{level}][%{logger}] %{message}"
      field: "message"
      target_prefix: "elasticsearch"
      when:
        contains:
          fields.service: "elasticsearch"

# 출력
output.elasticsearch:
  hosts: ["localhost:9200"]
  index: "filebeat-%{[agent.version]}-%{+yyyy.MM.dd}"
  pipeline: "elasticsearch-logs"
  
# Ingest Pipeline
setup.template.name: "filebeat"
setup.template.pattern: "filebeat-*"
```

### Logstash Pipeline

```ruby
# logstash-elasticsearch.conf
input {
  beats {
    port => 5044
  }
}

filter {
  # Elasticsearch 로그 파싱
  if [fields][service] == "elasticsearch" {
    grok {
      match => {
        "message" => "\[%{TIMESTAMP_ISO8601:timestamp}\]\[%{LOGLEVEL:level}\s*\]\[%{DATA:component}\s*\] \[%{DATA:node_name}\] %{GREEDYDATA:log_message}"
      }
    }
    
    date {
      match => ["timestamp", "ISO8601"]
      target => "@timestamp"
    }
    
    # 레벨별 태깅
    if [level] == "ERROR" or [level] == "WARN" {
      mutate {
        add_tag => ["alert"]
      }
    }
  }
  
  # Slow log 파싱
  if [fields][type] == "slowlog" {
    json {
      source => "message"
    }
    
    mutate {
      add_field => {
        "slowlog_duration_ms" => "%{took_millis}"
      }
    }
    
    # 느린 쿼리 알림 태깅
    if [took_millis] > 5000 {
      mutate {
        add_tag => ["very_slow_query"]
      }
    }
  }
  
  # GC 로그 파싱
  if [fields][type] == "gc_log" {
    grok {
      match => {
        "message" => "\[%{DATA:gc_timestamp}\]\[%{NUMBER:gc_time_seconds}s\]\[%{DATA:gc_type}\] %{GREEDYDATA:gc_details}"
      }
    }
    
    # GC 시간이 길면 알림
    if [gc_time_seconds] > 1.0 {
      mutate {
        add_tag => ["long_gc_pause"]
      }
    }
  }
}

output {
  elasticsearch {
    hosts => ["localhost:9200"]
    index => "elasticsearch-logs-%{+YYYY.MM.dd}"
    template_name => "elasticsearch-logs"
    template => "/etc/logstash/templates/elasticsearch-logs.json"
  }
  
  # 알림이 필요한 로그는 별도 처리
  if "alert" in [tags] {
    email {
      to => "ops-team@company.com"
      subject => "Elasticsearch Alert: %{level}"
      body => "Node: %{node_name}\nMessage: %{log_message}"
    }
  }
}
```

## 🎨 Kibana 대시보드

### 커스텀 대시보드 생성

```javascript
// create-dashboard.js
const { Client } = require('@elastic/elasticsearch');
const client = new Client({ node: 'http://localhost:9200' });

class DashboardCreator {
  /**
   * 클러스터 모니터링 대시보드
   */
  async createClusterDashboard() {
    // Index Pattern 생성
    await this.createIndexPattern('metricbeat-*', '@timestamp');
    
    // Visualizations 생성
    const visualizations = [
      this.createClusterHealthViz(),
      this.createNodeStatsViz(),
      this.createIndexingRateViz(),
      this.createSearchLatencyViz(),
      this.createJVMHeapViz(),
      this.createDiskUsageViz()
    ];
    
    // Dashboard 생성
    const dashboard = {
      version: '8.11.0',
      objects: [
        {
          id: 'cluster-monitoring-dashboard',
          type: 'dashboard',
          attributes: {
            title: 'Elasticsearch Cluster Monitoring',
            hits: 0,
            description: 'Real-time cluster monitoring dashboard',
            panelsJSON: JSON.stringify(this.createPanelLayout(visualizations)),
            timeRestore: true,
            timeTo: 'now',
            timeFrom: 'now-1h',
            refreshInterval: {
              pause: false,
              value: 10000
            }
          }
        },
        ...visualizations
      ]
    };
    
    // Kibana API로 대시보드 저장
    await this.saveDashboard(dashboard);
  }

  createClusterHealthViz() {
    return {
      id: 'cluster-health-status',
      type: 'visualization',
      attributes: {
        title: 'Cluster Health Status',
        visState: JSON.stringify({
          type: 'metric',
          params: {
            metric: {
              colorSchema: 'Green to Red',
              colorsRange: [
                { from: 0, to: 1 },
                { from: 1, to: 2 },
                { from: 2, to: 3 }
              ],
              labels: {
                show: true
              },
              style: {
                fontSize: 60,
                fontColor: '#000000'
              }
            }
          },
          aggs: [
            {
              id: '1',
              type: 'max',
              params: {
                field: 'elasticsearch.cluster.stats.status'
              }
            }
          ]
        })
      }
    };
  }

  createNodeStatsViz() {
    return {
      id: 'node-stats-table',
      type: 'visualization',
      attributes: {
        title: 'Node Statistics',
        visState: JSON.stringify({
          type: 'table',
          params: {
            perPage: 10,
            showPartialRows: false,
            showMetricsAtAllLevels: false
          },
          aggs: [
            {
              id: '1',
              type: 'avg',
              params: {
                field: 'elasticsearch.node.stats.jvm.mem.heap_used_percent'
              }
            },
            {
              id: '2',
              type: 'avg',
              params: {
                field: 'system.cpu.total.pct'
              }
            },
            {
              id: '3',
              type: 'avg',
              params: {
                field: 'system.memory.used.pct'
              }
            },
            {
              id: '4',
              type: 'terms',
              params: {
                field: 'elasticsearch.node.name',
                size: 20,
                order: 'desc',
                orderBy: '1'
              }
            }
          ]
        })
      }
    };
  }

  createIndexingRateViz() {
    return {
      id: 'indexing-rate',
      type: 'visualization',
      attributes: {
        title: 'Indexing Rate',
        visState: JSON.stringify({
          type: 'line',
          params: {
            grid: { categoryLines: false, valueAxis: 'ValueAxis-1' },
            categoryAxes: [{
              id: 'CategoryAxis-1',
              type: 'category',
              position: 'bottom',
              show: true,
              style: {},
              scale: { type: 'linear' },
              labels: { show: true, truncate: 100 },
              title: {}
            }],
            valueAxes: [{
              id: 'ValueAxis-1',
              name: 'LeftAxis-1',
              type: 'value',
              position: 'left',
              show: true,
              style: {},
              scale: { type: 'linear', mode: 'normal' },
              labels: { show: true, rotate: 0, filter: false, truncate: 100 },
              title: { text: 'Documents per second' }
            }]
          },
          aggs: [
            {
              id: '1',
              type: 'derivative',
              params: {
                field: 'elasticsearch.node.stats.indices.indexing.index_total'
              }
            },
            {
              id: '2',
              type: 'date_histogram',
              params: {
                field: '@timestamp',
                interval: '30s',
                customInterval: '2h',
                min_doc_count: 1,
                extended_bounds: {}
              }
            }
          ]
        })
      }
    };
  }

  createPanelLayout(visualizations) {
    return visualizations.map((viz, index) => ({
      version: '8.11.0',
      type: 'visualization',
      gridData: {
        x: (index % 2) * 24,
        y: Math.floor(index / 2) * 15,
        w: 24,
        h: 15,
        i: viz.id
      },
      panelIndex: viz.id,
      embeddableConfig: {},
      panelRefName: `panel_${index}`
    }));
  }

  async createIndexPattern(pattern, timeField) {
    // Kibana API를 통한 Index Pattern 생성
    const response = await fetch('http://localhost:5601/api/saved_objects/index-pattern', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'kbn-xsrf': 'true'
      },
      body: JSON.stringify({
        attributes: {
          title: pattern,
          timeFieldName: timeField
        }
      })
    });
    
    return response.json();
  }

  async saveDashboard(dashboard) {
    // Kibana API로 대시보드 저장
    const response = await fetch('http://localhost:5601/api/saved_objects/_import', {
      method: 'POST',
      headers: {
        'kbn-xsrf': 'true'
      },
      body: JSON.stringify(dashboard)
    });
    
    return response.json();
  }
}
```

## 🚨 알림 설정 (Watcher)

### Watcher 알림 규칙

```json
// 클러스터 상태 알림
PUT _watcher/watch/cluster_health_watch
{
  "trigger": {
    "schedule": {
      "interval": "1m"
    }
  },
  "input": {
    "http": {
      "request": {
        "scheme": "http",
        "host": "localhost",
        "port": 9200,
        "method": "get",
        "path": "/_cluster/health"
      }
    }
  },
  "condition": {
    "compare": {
      "ctx.payload.status": {
        "eq": "red"
      }
    }
  },
  "actions": {
    "send_email": {
      "email": {
        "to": "ops@company.com",
        "subject": "🚨 Elasticsearch Cluster is RED",
        "body": {
          "text": "Cluster {{ctx.payload.cluster_name}} status is {{ctx.payload.status}}. Unassigned shards: {{ctx.payload.unassigned_shards}}"
        }
      }
    },
    "slack_notification": {
      "webhook": {
        "scheme": "https",
        "host": "hooks.slack.com",
        "port": 443,
        "method": "post",
        "path": "/services/YOUR/SLACK/WEBHOOK",
        "body": {
          "text": "🚨 *Elasticsearch Alert*\nCluster Status: RED\nUnassigned Shards: {{ctx.payload.unassigned_shards}}"
        }
      }
    }
  }
}

// 디스크 사용량 알림
PUT _watcher/watch/disk_usage_watch
{
  "trigger": {
    "schedule": {
      "interval": "5m"
    }
  },
  "input": {
    "search": {
      "request": {
        "indices": ["metricbeat-*"],
        "body": {
          "size": 0,
          "query": {
            "range": {
              "@timestamp": {
                "gte": "now-5m"
              }
            }
          },
          "aggs": {
            "nodes": {
              "terms": {
                "field": "elasticsearch.node.name",
                "size": 100
              },
              "aggs": {
                "disk_usage": {
                  "max": {
                    "field": "system.filesystem.used.pct"
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  "condition": {
    "script": {
      "source": """
        return ctx.payload.aggregations.nodes.buckets.stream()
          .anyMatch(node -> node.disk_usage.value > 0.85);
      """
    }
  },
  "actions": {
    "log": {
      "logging": {
        "text": "Node {{node.key}} disk usage is {{node.disk_usage.value}}%"
      }
    }
  }
}

// JVM 힙 사용량 알림
PUT _watcher/watch/jvm_heap_watch
{
  "trigger": {
    "schedule": {
      "interval": "2m"
    }
  },
  "input": {
    "search": {
      "request": {
        "indices": ["metricbeat-*"],
        "body": {
          "query": {
            "bool": {
              "filter": [
                { "range": { "@timestamp": { "gte": "now-2m" }}},
                { "range": { "elasticsearch.node.stats.jvm.mem.heap_used_percent": { "gte": 85 }}}
              ]
            }
          }
        }
      }
    }
  },
  "condition": {
    "compare": {
      "ctx.payload.hits.total.value": {
        "gt": 0
      }
    }
  },
  "actions": {
    "send_alert": {
      "email": {
        "to": "ops@company.com",
        "subject": "⚠️ High JVM Heap Usage",
        "body": {
          "text": "{{ctx.payload.hits.total.value}} nodes have heap usage > 85%"
        }
      }
    }
  }
}
```

## 📊 실시간 모니터링 API

### 모니터링 서비스

```javascript
// monitoring-service.js
class MonitoringService {
  constructor(client) {
    this.client = client;
    this.alerts = [];
  }

  /**
   * 종합 클러스터 상태
   */
  async getClusterOverview() {
    const [health, stats, nodes] = await Promise.all([
      this.client.cluster.health(),
      this.client.cluster.stats(),
      this.client.nodes.stats()
    ]);

    return {
      status: health.status,
      nodes: {
        total: health.number_of_nodes,
        data: health.number_of_data_nodes
      },
      shards: {
        active: health.active_shards,
        relocating: health.relocating_shards,
        initializing: health.initializing_shards,
        unassigned: health.unassigned_shards
      },
      docs: {
        count: stats.indices.docs.count,
        deleted: stats.indices.docs.deleted
      },
      store: {
        size: this.formatBytes(stats.indices.store.size_in_bytes)
      },
      memory: {
        heap: this.calculateAverageHeap(nodes)
      }
    };
  }

  /**
   * 실시간 메트릭 스트리밍
   */
  async* streamMetrics(interval = 5000) {
    while (true) {
      const metrics = await this.collectMetrics();
      yield metrics;
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  async collectMetrics() {
    const timestamp = new Date().toISOString();
    
    const [indexing, search, nodes] = await Promise.all([
      this.getIndexingMetrics(),
      this.getSearchMetrics(),
      this.getNodeMetrics()
    ]);

    return {
      timestamp,
      indexing,
      search,
      nodes,
      alerts: this.checkThresholds({ indexing, search, nodes })
    };
  }

  async getIndexingMetrics() {
    const stats = await this.client.indices.stats({
      metric: 'indexing'
    });

    const current = stats._all.total.indexing.index_total;
    const rate = this.calculateRate('indexing', current);

    return {
      total: current,
      rate: rate,
      current: stats._all.total.indexing.index_current
    };
  }

  async getSearchMetrics() {
    const stats = await this.client.indices.stats({
      metric: 'search'
    });

    const current = stats._all.total.search.query_total;
    const rate = this.calculateRate('search', current);

    return {
      total: current,
      rate: rate,
      current: stats._all.total.search.query_current,
      avgLatency: stats._all.total.search.query_time_in_millis / current
    };
  }

  async getNodeMetrics() {
    const stats = await this.client.nodes.stats({
      metric: ['jvm', 'os', 'fs']
    });

    const nodes = [];
    for (const [id, node] of Object.entries(stats.nodes)) {
      nodes.push({
        id,
        name: node.name,
        heap: node.jvm.mem.heap_used_percent,
        cpu: node.os.cpu.percent,
        disk: this.calculateDiskUsage(node.fs)
      });
    }

    return nodes;
  }

  checkThresholds(metrics) {
    const alerts = [];

    // 노드별 체크
    metrics.nodes.forEach(node => {
      if (node.heap > 85) {
        alerts.push({
          type: 'warning',
          node: node.name,
          message: `High heap usage: ${node.heap}%`
        });
      }
      if (node.disk > 85) {
        alerts.push({
          type: 'warning',
          node: node.name,
          message: `High disk usage: ${node.disk}%`
        });
      }
    });

    // 검색 지연 체크
    if (metrics.search.avgLatency > 1000) {
      alerts.push({
        type: 'warning',
        message: `High search latency: ${metrics.search.avgLatency}ms`
      });
    }

    return alerts;
  }

  calculateRate(metric, current) {
    if (!this.previousValues) {
      this.previousValues = {};
    }

    const previous = this.previousValues[metric] || current;
    const rate = current - previous;
    this.previousValues[metric] = current;

    return rate;
  }

  calculateDiskUsage(fs) {
    const total = fs.total.total_in_bytes;
    const available = fs.total.available_in_bytes;
    return ((total - available) / total * 100).toFixed(2);
  }

  calculateAverageHeap(nodes) {
    const heapValues = Object.values(nodes.nodes)
      .map(node => node.jvm.mem.heap_used_percent);
    
    const average = heapValues.reduce((a, b) => a + b, 0) / heapValues.length;
    return average.toFixed(2);
  }

  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return `${bytes.toFixed(2)} ${units[i]}`;
  }
}

// WebSocket 서버로 실시간 메트릭 전송
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', async (ws) => {
  const monitor = new MonitoringService(client);
  
  for await (const metrics of monitor.streamMetrics()) {
    ws.send(JSON.stringify(metrics));
  }
});

module.exports = MonitoringService;
```

## 🎯 베스트 프랙티스

### 1. 모니터링 전략
- **다층 모니터링**: 클러스터, 노드, 인덱스 레벨
- **실시간 알림**: 임계값 기반 알림
- **히스토리 보관**: 장기 트렌드 분석
- **대시보드 커스터마이징**: 역할별 대시보드

### 2. 메트릭 수집
- **적절한 주기**: 10-30초 간격
- **필수 메트릭**: 힙, CPU, 디스크, 네트워크
- **비즈니스 메트릭**: 인덱싱/검색 속도
- **로그 통합**: 메트릭과 로그 연계

### 3. 알림 설정
- **단계별 알림**: Warning → Critical
- **알림 그룹핑**: 노이즈 감소
- **자동 복구**: 가능한 경우 자동화
- **에스컬레이션**: 심각도별 담당자

### 4. 문제 해결
- **근본 원인 분석**: 로그와 메트릭 상관관계
- **성능 프로파일링**: Hot threads, Profile API
- **용량 계획**: 트렌드 기반 예측
- **정기 점검**: 헬스 체크 자동화

---

🎉 **완료!** 모든 Elasticsearch 문서가 작성되었습니다!