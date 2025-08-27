# ⚡ Elasticsearch 성능 최적화 완벽 가이드

## 🎯 목표

Elasticsearch의 인덱싱과 검색 성능을 극대화하고 리소스를 효율적으로 관리합니다.

## 📊 성능 측정 및 분석

### 성능 메트릭 수집

```javascript
// performance-metrics.js
class PerformanceMetrics {
  constructor(client) {
    this.client = client;
  }

  /**
   * 인덱싱 성능 메트릭
   */
  async getIndexingMetrics() {
    const stats = await this.client.indices.stats({
      metric: 'indexing,refresh,flush,merge'
    });

    const metrics = {
      indexing: {
        totalDocs: stats._all.total.indexing.index_total,
        totalTime: stats._all.total.indexing.index_time_in_millis,
        currentRate: stats._all.total.indexing.index_current,
        avgTimePerDoc: stats._all.total.indexing.index_time_in_millis / 
                       stats._all.total.indexing.index_total
      },
      refresh: {
        total: stats._all.total.refresh.total,
        totalTime: stats._all.total.refresh.total_time_in_millis
      },
      flush: {
        total: stats._all.total.flush.total,
        totalTime: stats._all.total.flush.total_time_in_millis
      },
      merge: {
        total: stats._all.total.merges.total,
        totalTime: stats._all.total.merges.total_time_in_millis,
        currentMerges: stats._all.total.merges.current
      }
    };

    return metrics;
  }

  /**
   * 검색 성능 메트릭
   */
  async getSearchMetrics() {
    const stats = await this.client.indices.stats({
      metric: 'search,query_cache,request_cache,fielddata'
    });

    return {
      search: {
        totalQueries: stats._all.total.search.query_total,
        totalTime: stats._all.total.search.query_time_in_millis,
        currentQueries: stats._all.total.search.query_current,
        avgLatency: stats._all.total.search.query_time_in_millis / 
                   stats._all.total.search.query_total
      },
      queryCache: {
        size: stats._all.total.query_cache.memory_size_in_bytes,
        hitCount: stats._all.total.query_cache.hit_count,
        missCount: stats._all.total.query_cache.miss_count,
        hitRate: stats._all.total.query_cache.hit_count / 
                (stats._all.total.query_cache.hit_count + 
                 stats._all.total.query_cache.miss_count) * 100
      },
      requestCache: {
        size: stats._all.total.request_cache.memory_size_in_bytes,
        hitCount: stats._all.total.request_cache.hit_count,
        missCount: stats._all.total.request_cache.miss_count
      },
      fielddata: {
        size: stats._all.total.fielddata.memory_size_in_bytes,
        evictions: stats._all.total.fielddata.evictions
      }
    };
  }

  /**
   * 느린 쿼리 분석
   */
  async analyzeSlowQueries(index) {
    // Slow log 설정
    await this.client.indices.putSettings({
      index,
      body: {
        "index.search.slowlog.threshold.query.warn": "10s",
        "index.search.slowlog.threshold.query.info": "5s",
        "index.search.slowlog.threshold.query.debug": "2s",
        "index.search.slowlog.threshold.query.trace": "500ms",
        "index.search.slowlog.threshold.fetch.warn": "1s",
        "index.search.slowlog.threshold.fetch.info": "800ms",
        "index.search.slowlog.level": "info"
      }
    });

    // Slow log 조회 (별도 로그 파일에서)
    return {
      message: "Slow log enabled. Check elasticsearch slow log files."
    };
  }
}
```

## 🚀 인덱싱 성능 최적화

### Bulk 인덱싱 최적화

```javascript
// optimized-bulk-indexing.js
class OptimizedBulkIndexer {
  constructor(client) {
    this.client = client;
  }

  /**
   * 최적화된 벌크 인덱싱
   */
  async performBulkIndexing(index, documents, options = {}) {
    const {
      batchSize = 1000,        // 배치 크기
      concurrency = 4,         // 동시 실행 수
      refreshInterval = -1,    // refresh 비활성화
      replicas = 0,            // 복제본 제거
      pipeline = null          // ingest pipeline
    } = options;

    // 1. 인덱싱 전 설정 최적화
    await this.prepareIndexForBulk(index, refreshInterval, replicas);

    // 2. 문서를 배치로 분할
    const batches = this.createBatches(documents, batchSize);

    // 3. 병렬 처리
    const results = await this.processBatchesConcurrently(
      batches,
      index,
      concurrency,
      pipeline
    );

    // 4. 인덱싱 후 설정 복구
    await this.restoreIndexSettings(index);

    return results;
  }

  async prepareIndexForBulk(index, refreshInterval, replicas) {
    await this.client.indices.putSettings({
      index,
      body: {
        "index.refresh_interval": refreshInterval,
        "index.number_of_replicas": replicas,
        "index.translog.durability": "async",
        "index.translog.sync_interval": "30s",
        "index.translog.flush_threshold_size": "1gb"
      }
    });
  }

  createBatches(documents, batchSize) {
    const batches = [];
    for (let i = 0; i < documents.length; i += batchSize) {
      batches.push(documents.slice(i, i + batchSize));
    }
    return batches;
  }

  async processBatchesConcurrently(batches, index, concurrency, pipeline) {
    const results = [];
    const queue = [...batches];
    const workers = [];

    for (let i = 0; i < concurrency; i++) {
      workers.push(this.worker(queue, index, pipeline, results));
    }

    await Promise.all(workers);
    return results;
  }

  async worker(queue, index, pipeline, results) {
    while (queue.length > 0) {
      const batch = queue.shift();
      if (!batch) break;

      const bulkBody = batch.flatMap(doc => [
        { index: { _index: index, pipeline } },
        doc
      ]);

      try {
        const response = await this.client.bulk({
          body: bulkBody,
          refresh: false
        });

        results.push({
          took: response.took,
          errors: response.errors,
          items: response.items.length
        });
      } catch (error) {
        console.error('Bulk indexing error:', error);
        results.push({ error: error.message });
      }
    }
  }

  async restoreIndexSettings(index) {
    await this.client.indices.putSettings({
      index,
      body: {
        "index.refresh_interval": "5s",
        "index.number_of_replicas": 1,
        "index.translog.durability": "request"
      }
    });

    // Force merge
    await this.client.indices.forcemerge({
      index,
      max_num_segments: 1
    });
  }
}
```

### 인덱스 설정 최적화

```json
// 고성능 인덱스 설정
PUT high-performance-index
{
  "settings": {
    // 샤드 설정
    "number_of_shards": 5,
    "number_of_replicas": 1,
    
    // Refresh 설정
    "refresh_interval": "30s",
    
    // Translog 설정
    "translog": {
      "durability": "async",
      "sync_interval": "10s",
      "flush_threshold_size": "512mb"
    },
    
    // Merge 설정
    "merge": {
      "scheduler": {
        "max_thread_count": 4
      },
      "policy": {
        "max_merged_segment": "5gb",
        "segments_per_tier": 10,
        "floor_segment": "2mb"
      }
    },
    
    // 메모리 설정
    "indices.memory.index_buffer_size": "30%",
    
    // 압축
    "codec": "best_compression",
    
    // Routing
    "routing": {
      "allocation": {
        "total_shards_per_node": 5
      }
    }
  },
  "mappings": {
    "properties": {
      // 인덱싱만 하고 검색하지 않는 필드
      "raw_data": {
        "type": "text",
        "index": false
      },
      
      // Doc values 비활성화 (집계 안함)
      "description": {
        "type": "text",
        "doc_values": false
      },
      
      // Norms 비활성화 (스코어링 불필요)
      "log_message": {
        "type": "text",
        "norms": false
      },
      
      // 키워드 필드 최적화
      "status": {
        "type": "keyword",
        "eager_global_ordinals": true
      }
    }
  }
}
```

## 🔍 검색 성능 최적화

### Query 최적화 전략

```javascript
// search-optimization.js
class SearchOptimizer {
  /**
   * 최적화된 검색 쿼리
   */
  async optimizedSearch(index, query, options = {}) {
    const searchBody = {
      // 필요한 필드만 반환
      _source: options.fields || false,
      
      // Doc values fields (메모리 효율적)
      docvalue_fields: options.docValueFields,
      
      // 검색 타임아웃
      timeout: options.timeout || "10s",
      
      // Early termination
      terminate_after: options.terminateAfter,
      
      // Track total hits 비활성화 (불필요시)
      track_total_hits: options.trackTotalHits || false,
      
      query: this.optimizeQuery(query),
      
      // 정렬 최적화
      sort: options.sort || ["_score"],
      
      // 검색 타입
      search_type: options.searchType || "query_then_fetch"
    };

    // Request cache 활용
    const response = await this.client.search({
      index,
      body: searchBody,
      request_cache: true,
      preference: options.preference || "_local"
    });

    return response;
  }

  optimizeQuery(query) {
    // Filter context 활용
    if (query.bool) {
      const optimized = { bool: {} };
      
      // Must를 filter로 이동 (스코어링 불필요시)
      if (query.bool.must && !this.needsScoring(query.bool.must)) {
        optimized.bool.filter = query.bool.must;
      } else {
        optimized.bool.must = query.bool.must;
      }
      
      // Should, must_not 복사
      if (query.bool.should) optimized.bool.should = query.bool.should;
      if (query.bool.must_not) optimized.bool.must_not = query.bool.must_not;
      if (query.bool.filter) {
        optimized.bool.filter = optimized.bool.filter || [];
        optimized.bool.filter = optimized.bool.filter.concat(query.bool.filter);
      }
      
      return optimized;
    }
    
    return query;
  }

  needsScoring(clauses) {
    // 스코어링이 필요한 쿼리 타입 체크
    const scoringQueries = ['match', 'multi_match', 'match_phrase'];
    
    for (const clause of clauses) {
      const queryType = Object.keys(clause)[0];
      if (scoringQueries.includes(queryType)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 캐시 활용 검색
   */
  async cachedSearch(index, query) {
    // Query cache를 위한 필터 사용
    const searchBody = {
      size: 0,
      query: {
        bool: {
          filter: query
        }
      },
      aggs: {
        // 자주 사용되는 집계
        cached_agg: {
          terms: {
            field: "category.keyword",
            size: 100
          }
        }
      }
    };

    return await this.client.search({
      index,
      body: searchBody,
      request_cache: true
    });
  }

  /**
   * Scroll 대신 Search After 사용
   */
  async* searchAfterPagination(index, query, size = 100) {
    let searchAfter = null;
    
    while (true) {
      const searchBody = {
        size,
        query,
        sort: [
          { "created_at": "desc" },
          { "_id": "desc" }
        ]
      };
      
      if (searchAfter) {
        searchBody.search_after = searchAfter;
      }
      
      const response = await this.client.search({
        index,
        body: searchBody
      });
      
      if (response.hits.hits.length === 0) {
        break;
      }
      
      yield response.hits.hits;
      
      const lastHit = response.hits.hits[response.hits.hits.length - 1];
      searchAfter = lastHit.sort;
    }
  }
}
```

### 집계 최적화

```json
// 최적화된 집계 쿼리
GET /logs-*/_search
{
  "size": 0,
  "query": {
    "bool": {
      "filter": [  // Filter context 사용
        { "range": { "@timestamp": { "gte": "now-1h" }}}
      ]
    }
  },
  "aggs": {
    // Sampler aggregation으로 샘플링
    "sample": {
      "sampler": {
        "shard_size": 200
      },
      "aggs": {
        "top_errors": {
          "terms": {
            "field": "error.code",
            "size": 10,
            "execution_hint": "map"  // 실행 힌트
          }
        }
      }
    },
    
    // Composite aggregation으로 페이징
    "paginated": {
      "composite": {
        "size": 100,
        "sources": [
          { "date": { "date_histogram": { "field": "@timestamp", "calendar_interval": "1h" }}},
          { "host": { "terms": { "field": "host.keyword" }}}
        ]
      }
    },
    
    // Cardinality with precision threshold
    "unique_users": {
      "cardinality": {
        "field": "user.id",
        "precision_threshold": 100  // 정확도 vs 메모리 트레이드오프
      }
    }
  }
}
```

## 💾 메모리 관리

### JVM 힙 최적화

```yaml
# jvm.options
## 힙 크기 설정 (시스템 RAM의 50%, 최대 32GB)
-Xms16g
-Xmx16g

## G1GC 설정 (큰 힙에 적합)
-XX:+UseG1GC
-XX:G1ReservePercent=25
-XX:InitiatingHeapOccupancyPercent=30

## GC 로깅
-Xlog:gc*,gc+age=trace,safepoint:file=/var/log/elasticsearch/gc.log:utctime,pid,tags:filecount=32,filesize=64m

## 추가 최적화
-XX:+AlwaysPreTouch  # 힙 메모리 사전 할당
-XX:+DisableExplicitGC  # System.gc() 호출 무시
-XX:+UseStringDeduplication  # 문자열 중복 제거
-XX:MaxGCPauseMillis=200  # 최대 GC 일시정지 시간

## Direct memory
-XX:MaxDirectMemorySize=16g
```

### Circuit Breaker 설정

```json
PUT _cluster/settings
{
  "persistent": {
    // 전체 Circuit Breaker
    "indices.breaker.total.use_real_memory": true,
    "indices.breaker.total.limit": "95%",
    
    // Field data Circuit Breaker
    "indices.breaker.fielddata.limit": "40%",
    "indices.breaker.fielddata.overhead": 1.03,
    
    // Request Circuit Breaker
    "indices.breaker.request.limit": "60%",
    "indices.breaker.request.overhead": 1,
    
    // In-flight requests Circuit Breaker
    "network.breaker.inflight_requests.limit": "100%",
    "network.breaker.inflight_requests.overhead": 2,
    
    // Accounting Circuit Breaker
    "indices.breaker.accounting.limit": "100%",
    "indices.breaker.accounting.overhead": 1
  }
}
```

### 캐시 관리

```javascript
// cache-management.js
class CacheManager {
  /**
   * 캐시 설정 최적화
   */
  async optimizeCacheSettings(index) {
    await this.client.indices.putSettings({
      index,
      body: {
        // Query cache
        "index.queries.cache.enabled": true,
        "indices.queries.cache.size": "10%",
        
        // Request cache
        "index.requests.cache.enable": true,
        
        // Fielddata cache
        "indices.fielddata.cache.size": "20%"
      }
    });
  }

  /**
   * 캐시 상태 모니터링
   */
  async monitorCacheUsage() {
    const stats = await this.client.nodes.stats({
      metric: "indices"
    });

    const cacheStats = {};
    
    for (const [nodeId, node] of Object.entries(stats.nodes)) {
      cacheStats[node.name] = {
        queryCache: {
          size: node.indices.query_cache.memory_size_in_bytes,
          hitRate: (node.indices.query_cache.hit_count / 
                   (node.indices.query_cache.hit_count + 
                    node.indices.query_cache.miss_count)) * 100,
          evictions: node.indices.query_cache.evictions
        },
        requestCache: {
          size: node.indices.request_cache.memory_size_in_bytes,
          hitRate: (node.indices.request_cache.hit_count / 
                   (node.indices.request_cache.hit_count + 
                    node.indices.request_cache.miss_count)) * 100,
          evictions: node.indices.request_cache.evictions
        },
        fielddata: {
          size: node.indices.fielddata.memory_size_in_bytes,
          evictions: node.indices.fielddata.evictions
        }
      };
    }

    return cacheStats;
  }

  /**
   * 캐시 클리어
   */
  async clearCaches(index) {
    await this.client.indices.clearCache({
      index,
      query: true,
      request: true,
      fielddata: true
    });
  }
}
```

## 🔧 시스템 레벨 최적화

### OS 설정

```bash
#!/bin/bash
# os-optimization.sh

# Virtual memory 설정
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf

# Swappiness 감소
sudo sysctl -w vm.swappiness=1
echo "vm.swappiness=1" | sudo tee -a /etc/sysctl.conf

# File descriptors
echo "elasticsearch - nofile 65535" | sudo tee -a /etc/security/limits.conf
echo "elasticsearch - nproc 4096" | sudo tee -a /etc/security/limits.conf

# Memory lock
echo "elasticsearch - memlock unlimited" | sudo tee -a /etc/security/limits.conf

# TCP 설정
sudo sysctl -w net.ipv4.tcp_retries2=5
sudo sysctl -w net.core.somaxconn=65535
```

### 디스크 I/O 최적화

```javascript
// disk-optimization.js
class DiskOptimizer {
  /**
   * 디스크 사용량 모니터링
   */
  async monitorDiskUsage() {
    const stats = await this.client.nodes.stats({
      metric: "fs"
    });

    const diskStats = [];
    
    for (const [nodeId, node] of Object.entries(stats.nodes)) {
      const total = node.fs.total.total_in_bytes;
      const available = node.fs.total.available_in_bytes;
      const used = total - available;
      const usedPercent = (used / total) * 100;

      diskStats.push({
        node: node.name,
        total: this.formatBytes(total),
        used: this.formatBytes(used),
        available: this.formatBytes(available),
        usedPercent: usedPercent.toFixed(2)
      });

      // 경고
      if (usedPercent > 85) {
        console.warn(`Warning: Node ${node.name} disk usage is ${usedPercent}%`);
      }
    }

    return diskStats;
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

  /**
   * 인덱스별 디스크 사용량
   */
  async getIndexDiskUsage() {
    const stats = await this.client.indices.stats({
      metric: "store"
    });

    const indices = [];
    
    for (const [indexName, indexStats] of Object.entries(stats.indices)) {
      indices.push({
        index: indexName,
        primarySize: this.formatBytes(indexStats.primaries.store.size_in_bytes),
        totalSize: this.formatBytes(indexStats.total.store.size_in_bytes),
        documents: indexStats.primaries.docs.count
      });
    }

    return indices.sort((a, b) => 
      b.totalSize.localeCompare(a.totalSize)
    );
  }
}
```

## 📈 성능 벤치마킹

### 부하 테스트

```javascript
// load-testing.js
class LoadTester {
  constructor(client) {
    this.client = client;
  }

  /**
   * 인덱싱 부하 테스트
   */
  async indexingLoadTest(options = {}) {
    const {
      index = 'load-test',
      documentCount = 100000,
      batchSize = 1000,
      threads = 4
    } = options;

    console.log(`Starting indexing load test...`);
    const startTime = Date.now();

    // 문서 생성
    const documents = this.generateDocuments(documentCount);
    
    // 벌크 인덱싱
    const indexer = new OptimizedBulkIndexer(this.client);
    await indexer.performBulkIndexing(index, documents, {
      batchSize,
      concurrency: threads
    });

    const duration = (Date.now() - startTime) / 1000;
    const docsPerSecond = documentCount / duration;

    return {
      totalDocuments: documentCount,
      duration: `${duration.toFixed(2)}s`,
      docsPerSecond: Math.round(docsPerSecond),
      throughput: `${this.formatBytes(docsPerSecond * 1024)}/s`
    };
  }

  /**
   * 검색 부하 테스트
   */
  async searchLoadTest(options = {}) {
    const {
      index = 'load-test',
      queries = 10000,
      concurrency = 10
    } = options;

    console.log(`Starting search load test...`);
    const startTime = Date.now();
    let totalQueries = 0;
    let errors = 0;

    const workers = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(this.searchWorker(index, queries / concurrency));
    }

    const results = await Promise.all(workers);
    
    results.forEach(result => {
      totalQueries += result.queries;
      errors += result.errors;
    });

    const duration = (Date.now() - startTime) / 1000;
    const qps = totalQueries / duration;

    return {
      totalQueries,
      duration: `${duration.toFixed(2)}s`,
      qps: Math.round(qps),
      errors,
      avgLatency: `${(duration / totalQueries * 1000).toFixed(2)}ms`
    };
  }

  async searchWorker(index, queryCount) {
    let queries = 0;
    let errors = 0;

    for (let i = 0; i < queryCount; i++) {
      try {
        await this.client.search({
          index,
          body: {
            query: {
              match: {
                message: `test ${Math.random()}`
              }
            }
          }
        });
        queries++;
      } catch (error) {
        errors++;
      }
    }

    return { queries, errors };
  }

  generateDocuments(count) {
    const documents = [];
    for (let i = 0; i < count; i++) {
      documents.push({
        id: i,
        timestamp: new Date().toISOString(),
        message: `Test document ${i}`,
        value: Math.random() * 1000,
        category: `category-${i % 10}`,
        tags: [`tag-${i % 5}`, `tag-${i % 7}`]
      });
    }
    return documents;
  }

  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return `${bytes.toFixed(2)} ${units[i]}`;
  }
}
```

## 🎯 베스트 프랙티스

### 1. 인덱싱 최적화
- **Bulk API 사용**: 단일 요청 대신 벌크 사용
- **Refresh 제어**: 대량 인덱싱 시 비활성화
- **복제본 관리**: 인덱싱 후 추가
- **적절한 샤드 크기**: 20-40GB 유지

### 2. 검색 최적화
- **Filter context 활용**: 스코어링 불필요 시
- **캐싱 활용**: Request cache, Query cache
- **Source filtering**: 필요한 필드만 반환
- **Preference 설정**: 로컬 샤드 우선

### 3. 메모리 관리
- **힙 크기**: 시스템 RAM의 50%, 최대 32GB
- **Circuit breaker**: 적절한 임계값 설정
- **캐시 크기**: 워크로드에 맞게 조정
- **GC 튜닝**: G1GC 사용

### 4. 모니터링
- **성능 메트릭**: 지속적 모니터링
- **Slow log**: 느린 쿼리 추적
- **Hot threads**: CPU 사용량 분석
- **Profile API**: 쿼리 성능 분석

---

💡 **다음 단계**: [모니터링](../../06-monitoring/README.md)에서 클러스터 모니터링을 학습하세요!