# 📖 Elasticsearch 용어 사전

## 🗂️ 핵심 용어 정리

### A

#### **Aggregation (집계)**
```json
{
  "aggs": {
    "sales_by_category": {
      "terms": {
        "field": "category.keyword"
      }
    }
  }
}
```
- **정의**: 데이터를 그룹화하고 통계를 계산하는 기능
- **유형**: Bucket, Metric, Pipeline, Matrix
- **SQL 대응**: `GROUP BY`, `SUM()`, `AVG()` 등

#### **Alias (별칭)**
```bash
POST /_aliases
{
  "actions": [
    {
      "add": {
        "index": "logs-2024-01",
        "alias": "current-logs"
      }
    }
  ]
}
```
- **정의**: 하나 이상의 인덱스를 가리키는 별명
- **용도**: 무중단 인덱스 전환, 데이터 그룹핑

#### **Analyzer (분석기)**
```json
{
  "analyzer": {
    "my_analyzer": {
      "tokenizer": "standard",
      "filter": ["lowercase", "stop"]
    }
  }
}
```
- **구성요소**: Character Filter → Tokenizer → Token Filter
- **역할**: 텍스트를 검색 가능한 토큰으로 변환

---

### B

#### **Bulk API**
```bash
POST /_bulk
{ "index": { "_index": "products", "_id": "1" } }
{ "name": "노트북", "price": 1500000 }
{ "delete": { "_index": "products", "_id": "2" } }
```
- **정의**: 여러 작업을 한 번에 처리하는 API
- **지원 작업**: index, create, update, delete
- **장점**: 네트워크 오버헤드 감소, 처리 속도 향상

#### **Bucket (버킷)**
- **정의**: 집계에서 문서를 그룹화하는 단위
- **예시**: date_histogram, terms, range

---

### C

#### **Cluster (클러스터)**
```yaml
cluster.name: my-application
node.name: node-1
```
- **정의**: 하나 이상의 노드로 구성된 ES 인스턴스 그룹
- **특징**: 데이터와 작업 부하를 분산 처리

#### **Coordinating Node (조정 노드)**
```
요청 수신 → 관련 샤드 확인 → 요청 분배 → 결과 수집 → 병합 → 응답
```
- **역할**: 클라이언트 요청을 라우팅하고 결과를 병합

---

### D

#### **Document (문서)**
```json
{
  "_index": "users",
  "_id": "1",
  "_source": {
    "name": "김철수",
    "age": 30,
    "email": "kim@example.com"
  }
}
```
- **정의**: ES의 기본 정보 단위 (JSON 형식)
- **메타데이터**: _index, _type(deprecated), _id, _source

#### **Doc Values**
- **정의**: 디스크 기반 컬럼 저장 구조
- **용도**: 정렬, 집계, 스크립트 필드
- **특징**: 메모리 효율적, 느린 접근 속도

---

### E

#### **Elastic Stack (ELK Stack)**
```
Elasticsearch (저장/검색)
    ↕
Logstash (데이터 처리)
    ↕
Kibana (시각화)
    ↕
Beats (데이터 수집)
```
- **구성**: Elasticsearch + Logstash + Kibana + Beats
- **용도**: 로그 분석, 모니터링, 보안 분석

---

### F

#### **Field (필드)**
```json
{
  "mappings": {
    "properties": {
      "title": { "type": "text" },     // 필드 정의
      "price": { "type": "integer" },
      "created": { "type": "date" }
    }
  }
}
```
- **정의**: 문서 내 개별 데이터 항목
- **타입**: text, keyword, numeric, date, boolean, object, nested

#### **Filter Context (필터 컨텍스트)**
```json
{
  "query": {
    "bool": {
      "filter": [  // 필터 컨텍스트
        { "term": { "status": "published" } },
        { "range": { "price": { "gte": 10000 } } }
      ]
    }
  }
}
```
- **특징**: 스코어 계산 없음, 캐시 가능
- **용도**: Yes/No 질문 (문서 포함 여부)

---

### G

#### **GeoPoint / GeoShape**
```json
{
  "location": {
    "type": "geo_point"
  },
  "area": {
    "type": "geo_shape"
  }
}

// 사용 예
{
  "location": {
    "lat": 37.5665,
    "lon": 126.9780
  }
}
```
- **GeoPoint**: 위도/경도 좌표
- **GeoShape**: 복잡한 지리적 형태 (폴리곤 등)

---

### H

#### **Heap Memory**
```bash
# elasticsearch.yml
-Xms16g  # 최소 힙 메모리
-Xmx16g  # 최대 힙 메모리 (동일하게 설정)
```
- **권장사항**: 시스템 메모리의 50% 이하, 최대 32GB

#### **Hot-Warm Architecture**
```
Hot Nodes (SSD) → 최신 데이터, 빈번한 쿼리
    ↓ (시간 경과)
Warm Nodes (HDD) → 오래된 데이터, 간헐적 쿼리
    ↓ (보관 기한)
Cold Storage (Archive) → 장기 보관
```

---

### I

#### **Index (인덱스)**
```bash
PUT /my-index-2024
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1
  }
}
```
- **정의**: 유사한 특성을 가진 문서들의 집합
- **명명 규칙**: 소문자, 하이픈/언더스코어 허용

#### **Inverted Index (역인덱스)**
```
전통적 인덱스:
Doc1 → "Elasticsearch is powerful"
Doc2 → "Search is fast"

역인덱스:
"elasticsearch" → [Doc1]
"powerful" → [Doc1]
"search" → [Doc2]
"fast" → [Doc2]
```

#### **Ingest Pipeline**
```json
PUT _ingest/pipeline/my-pipeline
{
  "processors": [
    {
      "set": {
        "field": "timestamp",
        "value": "{{_ingest.timestamp}}"
      }
    },
    {
      "lowercase": {
        "field": "message"
      }
    }
  ]
}
```

---

### J

#### **JSON (JavaScript Object Notation)**
- **역할**: ES의 기본 데이터 형식
- **특징**: 스키마리스, 중첩 객체 지원

---

### K

#### **Kibana**
```
시각화 도구:
- Dashboard
- Discover
- Canvas
- Maps
- Machine Learning
```

#### **Keyword Field**
```json
{
  "category": {
    "type": "keyword"  // 정확한 매치용
  },
  "description": {
    "type": "text"     // 전문 검색용
  }
}
```

---

### L

#### **Lucene**
- **정의**: ES의 핵심 검색 엔진 라이브러리
- **제공 기능**: 역인덱스, 스코어링, 쿼리 파싱

#### **Logstash**
```ruby
input {
  file {
    path => "/var/log/*.log"
  }
}

filter {
  grok {
    match => { "message" => "%{COMMONAPACHELOG}" }
  }
}

output {
  elasticsearch {
    hosts => ["localhost:9200"]
    index => "logs-%{+YYYY.MM.dd}"
  }
}
```

---

### M

#### **Mapping (매핑)**
```json
PUT /products/_mapping
{
  "properties": {
    "name": {
      "type": "text",
      "fields": {
        "keyword": {
          "type": "keyword"
        }
      }
    }
  }
}
```
- **동적 매핑**: 자동 타입 추론
- **명시적 매핑**: 수동 타입 정의

#### **Master Node (마스터 노드)**
- **책임**: 클러스터 상태 관리, 샤드 할당, 인덱스 생성/삭제

#### **Multi-fields**
```json
{
  "title": {
    "type": "text",
    "fields": {
      "raw": { "type": "keyword" },
      "english": { "type": "text", "analyzer": "english" }
    }
  }
}
```

---

### N

#### **Node (노드)**
```yaml
# elasticsearch.yml
node.roles: [master, data, ingest]
node.name: es-node-01
```
- **타입**: Master, Data, Ingest, Coordinating, ML

#### **Near Real Time (NRT)**
- **정의**: 인덱싱 후 검색 가능까지 약 1초 지연
- **설정**: `refresh_interval` (기본 1초)

---

### O

#### **Offset**
- **정의**: 검색 결과의 시작 위치
```json
{
  "from": 10,  // offset
  "size": 20   // limit
}
```

---

### P

#### **Painless Script**
```json
{
  "script": {
    "lang": "painless",
    "source": "doc['price'].value * params.discount",
    "params": {
      "discount": 0.9
    }
  }
}
```
- **용도**: 동적 필드 계산, 스코어 조정, 집계 계산

#### **Percolator**
```json
// 쿼리 저장
PUT /queries/_doc/1
{
  "query": {
    "match": {
      "message": "error"
    }
  }
}

// 문서가 어떤 쿼리에 매치되는지 확인
GET /queries/_search
{
  "query": {
    "percolate": {
      "field": "query",
      "document": {
        "message": "This is an error message"
      }
    }
  }
}
```

---

### Q

#### **Query Context (쿼리 컨텍스트)**
```json
{
  "query": {
    "match": {  // 쿼리 컨텍스트 - 스코어 계산
      "title": "elasticsearch"
    }
  }
}
```
- **특징**: 관련도 스코어 계산
- **용도**: "얼마나 잘 매치되는가?"

#### **Query DSL (Domain Specific Language)**
```json
{
  "query": {
    "bool": {
      "must": [
        { "match": { "title": "검색" } }
      ],
      "filter": [
        { "range": { "price": { "gte": 10000 } } }
      ]
    }
  }
}
```

---

### R

#### **Reindex**
```json
POST _reindex
{
  "source": {
    "index": "old-index"
  },
  "dest": {
    "index": "new-index"
  }
}
```

#### **Replica Shard (복제 샤드)**
- **목적**: 고가용성, 읽기 성능 향상
- **설정**: `number_of_replicas`

#### **Relevance Score**
```
Score = TF (Term Frequency)
      × IDF (Inverse Document Frequency)  
      × Field Length Norm
```

---

### S

#### **Shard (샤드)**
```bash
Index (3 shards, 1 replica)
├── Primary Shard 0 → Replica Shard 0
├── Primary Shard 1 → Replica Shard 1
└── Primary Shard 2 → Replica Shard 2
```
- **Primary**: 원본 데이터
- **Replica**: 복제본
- **크기 권장**: 20-40GB

#### **Snapshot**
```bash
# 스냅샷 생성
PUT /_snapshot/my_backup/snapshot_1
{
  "indices": "index_1,index_2",
  "include_global_state": false
}
```

#### **Suggester**
```json
{
  "suggest": {
    "text": "엘라스틱서츠",
    "my-suggestion": {
      "term": {
        "field": "title"
      }
    }
  }
}
// 결과: "엘라스틱서치" 제안
```

---

### T

#### **Template (템플릿)**
```json
PUT _index_template/logs_template
{
  "index_patterns": ["logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 3
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" }
      }
    }
  }
}
```

#### **Term Query**
```json
{
  "query": {
    "term": {
      "status.keyword": "active"  // 정확한 매치
    }
  }
}
```

#### **Tokenizer**
```
"한국의 엘라스틱서치"
    ↓ standard tokenizer
["한국의", "엘라스틱서치"]
    ↓ nori tokenizer  
["한국", "의", "엘라스틱서치"]
```

#### **Translog (Transaction Log)**
- **역할**: 데이터 영속성 보장
- **동작**: 모든 작업을 로그에 기록 → flush 시 segment로 변환

---

### U

#### **Update API**
```json
POST /products/_update/1
{
  "doc": {
    "price": 1200000
  },
  "doc_as_upsert": true
}
```

#### **Upsert**
```json
POST /products/_update/1
{
  "script": {
    "source": "ctx._source.counter += params.count",
    "params": { "count": 1 }
  },
  "upsert": {
    "counter": 1
  }
}
```

---

### V

#### **Version**
- **내부 버전**: `_version` 필드로 동시성 제어
- **외부 버전**: `version_type=external`

---

### W

#### **Watcher (X-Pack)**
```json
{
  "trigger": {
    "schedule": { "interval": "10s" }
  },
  "input": {
    "search": {
      "request": {
        "indices": ["logs-*"],
        "body": {
          "query": {
            "match": { "status": "error" }
          }
        }
      }
    }
  },
  "actions": {
    "send_email": {
      "email": {
        "to": "admin@example.com",
        "subject": "Error Alert"
      }
    }
  }
}
```

---

### X

#### **X-Pack**
- **Security**: 인증/권한
- **Monitoring**: 클러스터 모니터링
- **Watcher**: 알림
- **Graph**: 그래프 탐색
- **ML**: 머신러닝
- **SQL**: SQL 쿼리 지원

---

### Y

#### **YAML**
```yaml
# elasticsearch.yml
cluster.name: my-cluster
node.name: node-1
path.data: /var/lib/elasticsearch
path.logs: /var/log/elasticsearch
```

---

### Z

#### **Zen Discovery**
- **정의**: ES의 노드 발견 메커니즘 (7.x에서 개선)
- **설정**: `discovery.seed_hosts`, `cluster.initial_master_nodes`

---

## 🎯 자주 헷갈리는 용어 비교

### Match vs Term
```json
// Match: 분석된 텍스트 검색
{ "match": { "title": "엘라스틱 서치" } }  // "엘라스틱", "서치" 토큰화

// Term: 정확한 매치
{ "term": { "status.keyword": "active" } }  // 정확히 "active"
```

### Text vs Keyword
```json
{
  "title": { "type": "text" },      // 전문 검색용
  "category": { "type": "keyword" }  // 정확한 매치, 집계용
}
```

### Query Context vs Filter Context
```json
{
  "query": {
    "bool": {
      "must": [  // Query context: 스코어 계산
        { "match": { "title": "검색" } }
      ],
      "filter": [  // Filter context: Yes/No
        { "term": { "status": "published" } }
      ]
    }
  }
}
```

### Doc Values vs Field Data
- **Doc Values**: 디스크 기반, 기본값, 메모리 효율적
- **Field Data**: 메모리 기반, text 필드용, 메모리 집약적

---

💡 **다음 단계**: [데이터 구조](./data-structure.md)에서 ES의 내부 데이터 구조를 알아보세요!