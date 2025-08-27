# 🌐 Elasticsearch Clustering 완벽 가이드

## 🎯 목표

Elasticsearch 클러스터의 설계, 구축, 운영 및 최적화를 마스터합니다.

## 🏗️ 클러스터 아키텍처

### 노드 역할과 구성

```
┌────────────────────────────────────────────────────────┐
│                  Elasticsearch Cluster                  │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │ Master Node  │  │ Master Node  │  │ Master Node  ││
│  │  (master)    │  │  (master)    │  │  (master)    ││
│  └──────────────┘  └──────────────┘  └──────────────┘│
│                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │  Data Node   │  │  Data Node   │  │  Data Node   ││
│  │(data, ingest)│  │(data, ingest)│  │   (data)     ││
│  └──────────────┘  └──────────────┘  └──────────────┘│
│                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │Coordinate    │  │   ML Node    │  │ Transform    ││
│  │    Node      │  │              │  │    Node      ││
│  └──────────────┘  └──────────────┘  └──────────────┘│
└────────────────────────────────────────────────────────┘
```

## 🔧 노드 타입별 설정

### Master Node 설정

```yaml
# master-node.yml
cluster.name: production-cluster
node.name: master-01
node.roles: [ master ]

# 마스터 노드 전용 설정
cluster.initial_master_nodes:
  - master-01
  - master-02
  - master-03

# 최소 마스터 노드 수 (과반수)
discovery.zen.minimum_master_nodes: 2

# 네트워크 설정
network.host: 0.0.0.0
http.port: 9200
transport.port: 9300

# 디스커버리 설정
discovery.seed_hosts:
  - master-01:9300
  - master-02:9300
  - master-03:9300

# 마스터 노드는 데이터 저장 안함
path.data: /var/lib/elasticsearch
path.logs: /var/log/elasticsearch

# JVM 힙 설정 (작게 유지)
# jvm.options: -Xms2g -Xmx2g
```

### Data Node 설정

```yaml
# data-node.yml
cluster.name: production-cluster
node.name: data-01
node.roles: [ data, ingest ]

# 데이터 노드 설정
node.attr.box_type: hot  # hot, warm, cold
node.attr.zone: zone-1

# 네트워크
network.host: 0.0.0.0
http.port: 9200
transport.port: 9300

# 디스커버리
discovery.seed_hosts:
  - master-01:9300
  - master-02:9300
  - master-03:9300

# 스토리지
path.data:
  - /mnt/disk1/elasticsearch
  - /mnt/disk2/elasticsearch
  - /mnt/disk3/elasticsearch
path.logs: /var/log/elasticsearch

# 성능 설정
indices.memory.index_buffer_size: 30%
indices.queries.cache.size: 15%
indices.fielddata.cache.size: 30%

# Thread pools
thread_pool:
  write:
    size: 10
    queue_size: 1000
  search:
    size: 30
    queue_size: 1000
```

### Coordinating Node 설정

```yaml
# coordinating-node.yml
cluster.name: production-cluster
node.name: coord-01
node.roles: []  # 빈 배열 = coordinating only

# 네트워크
network.host: 0.0.0.0
http.port: 9200
transport.port: 9300

# 디스커버리
discovery.seed_hosts:
  - master-01:9300
  - master-02:9300
  - master-03:9300

# 캐시 설정 (검색 최적화)
indices.queries.cache.size: 20%
indices.requests.cache.size: 5%

# JVM 설정 (중간 크기)
# jvm.options: -Xms8g -Xmx8g
```

## 🌡️ Hot-Warm-Cold 아키텍처

### 데이터 라이프사이클 관리

```json
// Hot-Warm-Cold 인덱스 템플릿
PUT _index_template/logs-template
{
  "index_patterns": ["logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 3,
      "number_of_replicas": 1,
      "index.routing.allocation.include.box_type": "hot",
      "index.lifecycle.name": "logs-lifecycle-policy"
    }
  }
}

// ILM Policy
PUT _ilm/policy/logs-lifecycle-policy
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_age": "7d",
            "max_size": "50GB"
          },
          "set_priority": {
            "priority": 100
          }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": {
            "number_of_shards": 1
          },
          "allocate": {
            "include": {
              "box_type": "warm"
            }
          },
          "forcemerge": {
            "max_num_segments": 1
          },
          "set_priority": {
            "priority": 50
          }
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": {
          "allocate": {
            "include": {
              "box_type": "cold"
            },
            "number_of_replicas": 0
          },
          "freeze": {},
          "set_priority": {
            "priority": 0
          }
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

### 노드별 하드웨어 스펙

```javascript
// cluster-design.js
const clusterDesign = {
  hot_nodes: {
    count: 3,
    specs: {
      cpu: "16 cores",
      ram: "64GB",
      storage: "2TB NVMe SSD",
      network: "10Gbps"
    },
    jvm_heap: "30GB",
    node_roles: ["data_hot", "ingest"]
  },
  
  warm_nodes: {
    count: 3,
    specs: {
      cpu: "8 cores",
      ram: "32GB",
      storage: "8TB SSD",
      network: "1Gbps"
    },
    jvm_heap: "16GB",
    node_roles: ["data_warm"]
  },
  
  cold_nodes: {
    count: 2,
    specs: {
      cpu: "4 cores",
      ram: "16GB",
      storage: "20TB HDD",
      network: "1Gbps"
    },
    jvm_heap: "8GB",
    node_roles: ["data_cold"]
  },
  
  master_nodes: {
    count: 3,
    specs: {
      cpu: "4 cores",
      ram: "8GB",
      storage: "100GB SSD",
      network: "1Gbps"
    },
    jvm_heap: "4GB",
    node_roles: ["master"]
  }
};
```

## 🔄 클러스터 관리

### 샤드 할당 제어

```json
// 샤드 재할당 비활성화 (유지보수 시)
PUT _cluster/settings
{
  "transient": {
    "cluster.routing.allocation.enable": "none"
  }
}

// 특정 노드 제외
PUT _cluster/settings
{
  "transient": {
    "cluster.routing.allocation.exclude._ip": "10.0.0.1"
  }
}

// 샤드 재할당 활성화
PUT _cluster/settings
{
  "transient": {
    "cluster.routing.allocation.enable": "all"
  }
}

// 샤드 이동
POST _cluster/reroute
{
  "commands": [
    {
      "move": {
        "index": "products",
        "shard": 0,
        "from_node": "node-1",
        "to_node": "node-2"
      }
    }
  ]
}

// Allocation Awareness
PUT _cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.awareness.attributes": "zone",
    "cluster.routing.allocation.awareness.force.zone.values": "zone-1,zone-2"
  }
}
```

### 클러스터 상태 모니터링

```javascript
// cluster-monitor.js
class ClusterMonitor {
  constructor(client) {
    this.client = client;
  }

  /**
   * 클러스터 건강 상태 확인
   */
  async checkHealth() {
    const health = await this.client.cluster.health({
      level: 'indices',
      timeout: '30s'
    });

    const alerts = [];
    
    if (health.status === 'red') {
      alerts.push({
        severity: 'critical',
        message: 'Cluster status is RED'
      });
    } else if (health.status === 'yellow') {
      alerts.push({
        severity: 'warning',
        message: 'Cluster status is YELLOW'
      });
    }

    if (health.unassigned_shards > 0) {
      alerts.push({
        severity: 'warning',
        message: `${health.unassigned_shards} unassigned shards`
      });
    }

    return {
      health,
      alerts
    };
  }

  /**
   * 노드 상태 모니터링
   */
  async monitorNodes() {
    const stats = await this.client.nodes.stats({
      metric: ['jvm', 'os', 'fs', 'indices']
    });

    const nodes = [];
    
    for (const [nodeId, node] of Object.entries(stats.nodes)) {
      const nodeInfo = {
        id: nodeId,
        name: node.name,
        roles: node.roles,
        jvm: {
          heap_used_percent: node.jvm.mem.heap_used_percent,
          gc_count: node.jvm.gc.collectors.young.collection_count +
                    node.jvm.gc.collectors.old.collection_count
        },
        cpu: {
          percent: node.os.cpu.percent,
          load_average: node.os.cpu.load_average
        },
        disk: {
          available: node.fs.total.available_in_bytes,
          used_percent: ((node.fs.total.total_in_bytes - 
                         node.fs.total.available_in_bytes) / 
                         node.fs.total.total_in_bytes * 100)
        },
        indices: {
          docs: node.indices.docs.count,
          size: node.indices.store.size_in_bytes
        }
      };

      // 경고 확인
      if (nodeInfo.jvm.heap_used_percent > 85) {
        nodeInfo.warning = 'High heap usage';
      }
      if (nodeInfo.disk.used_percent > 85) {
        nodeInfo.warning = 'High disk usage';
      }

      nodes.push(nodeInfo);
    }

    return nodes;
  }

  /**
   * 샤드 분포 분석
   */
  async analyzeShardDistribution() {
    const shards = await this.client.cat.shards({
      format: 'json',
      h: ['index', 'shard', 'prirep', 'state', 'node', 'store']
    });

    const nodeDistribution = {};
    
    shards.forEach(shard => {
      if (!nodeDistribution[shard.node]) {
        nodeDistribution[shard.node] = {
          primary: 0,
          replica: 0,
          total: 0,
          size: 0
        };
      }

      const node = nodeDistribution[shard.node];
      node.total++;
      
      if (shard.prirep === 'p') {
        node.primary++;
      } else {
        node.replica++;
      }

      // 크기 파싱 (예: "1.2gb" -> bytes)
      const size = this.parseSize(shard.store);
      node.size += size;
    });

    return nodeDistribution;
  }

  parseSize(sizeStr) {
    const units = {
      'b': 1,
      'kb': 1024,
      'mb': 1024 * 1024,
      'gb': 1024 * 1024 * 1024,
      'tb': 1024 * 1024 * 1024 * 1024
    };
    
    const match = sizeStr.match(/^([\d.]+)([a-z]+)$/i);
    if (match) {
      return parseFloat(match[1]) * (units[match[2].toLowerCase()] || 1);
    }
    return 0;
  }
}
```

## 🚀 클러스터 확장 전략

### 수평 확장 (Scale Out)

```bash
#!/bin/bash
# add-data-node.sh

# 새 데이터 노드 추가 스크립트
NODE_NAME="data-04"
CLUSTER_NAME="production-cluster"
MASTER_NODES="master-01:9300,master-02:9300,master-03:9300"

# Elasticsearch 설치
sudo apt-get update
sudo apt-get install -y elasticsearch=8.11.0

# 설정 파일 생성
cat > /etc/elasticsearch/elasticsearch.yml <<EOF
cluster.name: ${CLUSTER_NAME}
node.name: ${NODE_NAME}
node.roles: [ data ]
network.host: 0.0.0.0
discovery.seed_hosts: [${MASTER_NODES}]
path.data: /var/lib/elasticsearch
path.logs: /var/log/elasticsearch
EOF

# JVM 설정
echo "-Xms16g" > /etc/elasticsearch/jvm.options.d/heap.options
echo "-Xmx16g" >> /etc/elasticsearch/jvm.options.d/heap.options

# 서비스 시작
sudo systemctl start elasticsearch
sudo systemctl enable elasticsearch

# 클러스터 조인 확인
sleep 30
curl -X GET "localhost:9200/_cat/nodes?v"
```

### 수직 확장 (Scale Up)

```javascript
// vertical-scaling.js
class VerticalScaling {
  /**
   * 노드 리소스 업그레이드 절차
   */
  async upgradeNode(nodeName) {
    // 1. 샤드 재할당 비활성화
    await this.client.cluster.putSettings({
      body: {
        transient: {
          "cluster.routing.allocation.enable": "none"
        }
      }
    });

    // 2. 노드에서 샤드 이동
    await this.client.cluster.putSettings({
      body: {
        transient: {
          "cluster.routing.allocation.exclude._name": nodeName
        }
      }
    });

    // 3. 샤드 이동 대기
    await this.waitForShardRelocation(nodeName);

    // 4. 노드 종료
    console.log(`Shutdown node: ${nodeName}`);
    // 실제 종료 명령 실행

    // 5. 하드웨어 업그레이드
    console.log('Performing hardware upgrade...');
    // RAM 추가, CPU 업그레이드 등

    // 6. 노드 재시작
    console.log(`Restart node: ${nodeName}`);
    // 노드 재시작 명령

    // 7. 샤드 재할당 활성화
    await this.client.cluster.putSettings({
      body: {
        transient: {
          "cluster.routing.allocation.enable": "all",
          "cluster.routing.allocation.exclude._name": null
        }
      }
    });
  }

  async waitForShardRelocation(nodeName) {
    while (true) {
      const shards = await this.client.cat.shards({
        format: 'json',
        h: ['node']
      });

      const nodeShards = shards.filter(s => s.node === nodeName);
      
      if (nodeShards.length === 0) {
        break;
      }

      console.log(`Waiting for ${nodeShards.length} shards to relocate...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}
```

## 🛡️ 클러스터 복원력

### Split Brain 방지

```yaml
# elasticsearch.yml
# 최소 마스터 노드 설정 (과반수)
discovery.zen.minimum_master_nodes: 2  # 3개 마스터 중 2개

# 노드 간 통신 타임아웃
discovery.zen.ping_timeout: 10s
discovery.zen.join_timeout: 30s

# 마스터 선출 설정
cluster.election.duration: 1m
cluster.fault_detection.leader_check.interval: 1s
```

### 자동 복구 설정

```json
// 자동 복구 정책
PUT _cluster/settings
{
  "persistent": {
    // 샤드 복구 동시 실행 수
    "cluster.routing.allocation.node_concurrent_recoveries": 2,
    
    // 노드당 동시 복구
    "cluster.routing.allocation.node_initial_primaries_recoveries": 4,
    
    // 네트워크 대역폭 제한
    "indices.recovery.max_bytes_per_sec": "50mb",
    
    // 복구 재시도
    "indices.recovery.retry_delay_state_sync": "500ms",
    "indices.recovery.retry_delay_network": "5s",
    
    // 디스크 워터마크
    "cluster.routing.allocation.disk.watermark.low": "85%",
    "cluster.routing.allocation.disk.watermark.high": "90%",
    "cluster.routing.allocation.disk.watermark.flood_stage": "95%"
  }
}
```

## 📊 클러스터 벤치마킹

### Rally를 이용한 성능 테스트

```bash
# Rally 설치
pip install esrally

# 벤치마크 실행
esrally race --distribution-version=8.11.0 \
  --target-hosts=localhost:9200 \
  --pipeline=benchmark-only \
  --challenge=append-no-conflicts \
  --track=geonames

# 커스텀 트랙 생성
cat > custom-track.json <<EOF
{
  "version": 2,
  "description": "Custom benchmark track",
  "indices": [
    {
      "name": "test-index",
      "body": "test-index.json"
    }
  ],
  "corpora": [
    {
      "name": "test-docs",
      "documents": [
        {
          "source-file": "documents.json.bz2",
          "document-count": 1000000
        }
      ]
    }
  ],
  "schedule": [
    {
      "operation": "bulk",
      "warmup-time-period": 120,
      "time-period": 300,
      "clients": 8
    }
  ]
}
EOF
```

### 클러스터 용량 계획

```javascript
// capacity-planning.js
class CapacityPlanner {
  /**
   * 필요 노드 수 계산
   */
  calculateNodeRequirements(requirements) {
    const {
      totalDataGB,
      dailyIngestionGB,
      queryQPS,
      replicationFactor = 1,
      growthRate = 0.2
    } = requirements;

    // 스토리지 계산
    const totalStorageNeeded = totalDataGB * (1 + replicationFactor);
    const storageWithGrowth = totalStorageNeeded * (1 + growthRate);
    
    // 권장 샤드 크기: 20-40GB
    const optimalShardSize = 30;
    const numberOfShards = Math.ceil(totalDataGB / optimalShardSize);
    
    // 노드당 권장 샤드 수: 20개
    const shardsPerNode = 20;
    const minDataNodes = Math.ceil(
      (numberOfShards * (1 + replicationFactor)) / shardsPerNode
    );

    // 처리량 기반 계산
    const qpsPerNode = 100; // 노드당 처리 가능 QPS
    const minNodesForQuery = Math.ceil(queryQPS / qpsPerNode);

    // 최종 노드 수
    const recommendedDataNodes = Math.max(minDataNodes, minNodesForQuery);

    return {
      shards: numberOfShards,
      replicas: replicationFactor,
      dataNodes: recommendedDataNodes,
      masterNodes: 3, // 항상 홀수
      coordinatingNodes: Math.ceil(recommendedDataNodes / 3),
      totalStorage: storageWithGrowth,
      estimatedCost: this.estimateCost(recommendedDataNodes)
    };
  }

  estimateCost(nodeCount) {
    const costPerNode = {
      hot: 500,   // $/month
      warm: 200,  // $/month
      cold: 100   // $/month
    };

    // 70% hot, 20% warm, 10% cold 가정
    const hotNodes = Math.ceil(nodeCount * 0.7);
    const warmNodes = Math.ceil(nodeCount * 0.2);
    const coldNodes = Math.ceil(nodeCount * 0.1);

    return {
      monthly: (hotNodes * costPerNode.hot) + 
               (warmNodes * costPerNode.warm) + 
               (coldNodes * costPerNode.cold),
      yearly: this.monthly * 12
    };
  }
}
```

## 🎯 베스트 프랙티스

### 1. 클러스터 설계
- **마스터 노드**: 항상 홀수 (3, 5, 7)
- **데이터 노드**: CPU/RAM보다 스토리지 중심
- **조정 노드**: 부하 분산용으로 활용

### 2. 샤드 전략
- **샤드 크기**: 20-40GB 유지
- **샤드 수**: 노드당 20개 이하
- **복제본**: 최소 1개 이상

### 3. 모니터링
- **메트릭 수집**: Metricbeat 활용
- **로그 수집**: Filebeat + Logstash
- **알림 설정**: Watcher 또는 ElastAlert

### 4. 백업 전략
- **스냅샷**: 정기적 스냅샷 생성
- **원격 저장소**: S3, GCS 등 활용
- **복구 테스트**: 정기적 복구 훈련

---

💡 **다음 단계**: [성능 최적화](../performance/README.md)에서 성능 튜닝을 학습하세요!