# 📊 Elasticsearch 데이터 구조 심층 분석

## 🎯 데이터 구조 개요

```
┌───────────────────────────────────────────┐
│           Elasticsearch Cluster             │
├───────────────────────────────────────────┤
│  ┌───────────────────────────────────┐   │
│  │          Index                    │   │
│  ├───────────────────────────────────┤   │
│  │  ┌──────────┐  ┌──────────┐      │   │
│  │  │  Shard 0  │  │  Shard 1  │      │   │
│  │  ├──────────┤  ├──────────┤      │   │
│  │  │ Segments  │  │ Segments  │      │   │
│  │  │ Documents │  │ Documents │      │   │
│  │  └──────────┘  └──────────┘      │   │
│  └───────────────────────────────────┘   │
└───────────────────────────────────────────┘
```

## 🗜️ 역인덱스 (Inverted Index) 구조

### 기본 개념

```
문서 데이터:
Doc1: "Elasticsearch is a search engine"
Doc2: "Search engines are powerful tools"
Doc3: "Elasticsearch provides full-text search"

↓ 토큰화 및 정규화

역인덱스 구조:
┌───────────────┬────────────────────────────┐
│     Term      │      Posting List          │
├───────────────┼────────────────────────────┤
│ elasticsearch │ Doc1(pos:0), Doc3(pos:0)  │
│ search        │ Doc1(pos:3), Doc2(pos:0), │
│               │ Doc3(pos:3)               │
│ engine        │ Doc1(pos:4), Doc2(pos:1)  │
│ powerful      │ Doc2(pos:3)                │
│ tools         │ Doc2(pos:4)                │
│ provides      │ Doc3(pos:1)                │
│ full-text     │ Doc3(pos:2)                │
└───────────────┴────────────────────────────┘
```

### 역인덱스 세부 구조

```
┌────────────────────────────────────────┐
│          Inverted Index Components         │
├────────────────────────────────────────┤
│                                            │
│  1. Term Dictionary (텍 사전)               │
│     • 모든 고유 테름의 정렬된 목록            │
│     • FST (Finite State Transducer) 사용  │
│                                            │
│  2. Posting List (포스팅 리스트)            │
│     • 각 테름이 나타나는 문서 ID 목록        │
│     • 위치 정보 (position)                  │
│     • 빈도 정보 (frequency)                 │
│                                            │
│  3. Doc Values                             │
│     • 컴럼 지향 저장                         │
│     • 정렬, 집계용                           │
│                                            │
│  4. Stored Fields                          │
│     • 원본 문서 데이터                        │
│     • _source 필드                          │
└────────────────────────────────────────┘
```

## 📦 세그먼트 (Segment) 구조

### 세그먼트 내부 구성

```
┌────────────────────────────────────────┐
│              Segment Structure             │
├────────────────────────────────────────┤
│                                            │
│  ┌──────────────────────────────────┐  │
│  │ Segment Info (.si)                  │  │
│  │ • 세그먼트 메타데이터                    │  │
│  └──────────────────────────────────┘  │
│                                            │
│  ┌──────────────────────────────────┐  │
│  │ Field Info (.fnm)                   │  │
│  │ • 필드 명과 설정                       │  │
│  └──────────────────────────────────┘  │
│                                            │
│  ┌──────────────────────────────────┐  │
│  │ Term Dictionary (.tim)              │  │
│  │ • 테름 사전 (FST)                      │  │
│  └──────────────────────────────────┘  │
│                                            │
│  ┌──────────────────────────────────┐  │
│  │ Term Index (.tip)                   │  │
│  │ • 테름 사전의 인덱스                    │  │
│  └──────────────────────────────────┘  │
│                                            │
│  ┌──────────────────────────────────┐  │
│  │ Postings (.doc, .pos, .pay)        │  │
│  │ • 문서 ID, 위치, 페이로드              │  │
│  └──────────────────────────────────┘  │
│                                            │
│  ┌──────────────────────────────────┐  │
│  │ Stored Fields (.fdt, .fdx)         │  │
│  │ • 원본 필드 데이터                     │  │
│  └──────────────────────────────────┘  │
│                                            │
│  ┌──────────────────────────────────┐  │
│  │ Doc Values (.dvd, .dvm)            │  │
│  │ • 컴럼 지향 저장                       │  │
│  └──────────────────────────────────┘  │
│                                            │
│  ┌──────────────────────────────────┐  │
│  │ Term Vectors (.tvd, .tvx)          │  │
│  │ • 테름 벡터 정보                       │  │
│  └──────────────────────────────────┘  │
│                                            │
└────────────────────────────────────────┘
```

### 세그먼트 병합 과정

```
╔════════════════════════════════════════╗
║          Segment Merging Process          ║
╚════════════════════════════════════════╝

1. 초기 상태:
   [S1:10MB] [S2:10MB] [S3:10MB] [S4:5MB]

2. 병합 트리거 (3개의 10MB 세그먼트):
   Merging: [S1 + S2 + S3] → [S5:30MB]
   
3. 병합 후:
   [S5:30MB] [S4:5MB]

4. 새 데이터 추가:
   [S5:30MB] [S4:5MB] [S6:10MB] [S7:10MB]

5. 다시 병합:
   [S5:30MB] [S8:25MB]
```

## 💾 Doc Values 구조

### Row vs Column 지향 저장

```
Row-Oriented (Stored Fields):
┌──────┬────────┬───────┬────────┐
│ DocID│  Name  │  Age  │  City  │
├──────┼────────┼───────┼────────┤
│  1   │ Alice  │  30   │ Seoul  │ ← Doc1
│  2   │  Bob   │  25   │ Busan  │ ← Doc2
│  3   │ Carol  │  28   │ Seoul  │ ← Doc3
└──────┴────────┴───────┴────────┘

Column-Oriented (Doc Values):
┌─────────────────────────────────────┐
│ Name Column: [Alice, Bob, Carol]         │
│ Age Column:  [30, 25, 28]                │
│ City Column: [Seoul, Busan, Seoul]       │
└─────────────────────────────────────┘
```

### Doc Values 타입

```
┌───────────────────────────────────────┐
│           Doc Values Types               │
├───────────────────────────────────────┤
│                                          │
│ 1. NUMERIC                               │
│    • integers, floats, dates            │
│    • 압축된 숫자 배열                      │
│                                          │
│ 2. BINARY                                │
│    • byte arrays                        │
│    • 고정 크기 또는 가변 크기              │
│                                          │
│ 3. SORTED                                │
│    • keyword 필드                        │
│    • 정렬된 문자열                         │
│                                          │
│ 4. SORTED_SET                            │
│    • multi-valued 필드                  │
│    • 태그, 카테고리 등                      │
│                                          │
│ 5. SORTED_NUMERIC                        │
│    • multi-valued numeric 필드          │
└───────────────────────────────────────┘
```

## 🔄 Translog 구조

### Translog 동작 방식

```
┌───────────────────────────────────────┐
│         Translog Write Process           │
└───────────────┬───────────────────────┘
                 ↓
    1. Document Write Request
                 ↓
    2. Write to Memory Buffer
                 ↓
    3. Append to Translog (fsync)
                 ↓
    4. Return Success to Client
                 ↓
    5. Refresh (1s) - Searchable
                 ↓
    6. Flush - Commit to Segment
                 ↓
    7. Clear Translog
```

### Translog 파일 구조

```
Translog Directory:
/data/nodes/0/indices/{index-uuid}/0/translog/
├── translog-1.tlog      (oldest)
├── translog-2.tlog
├── translog-3.tlog      (current)
├── translog.ckp         (checkpoint)
└── translog-3.tlog.tmp  (temp file)

Translog Entry Structure:
┌─────────────────────────────────────┐
│ Length  │ Type │ Seq# │ Primary Term │ Data │
│ (4 byte)│(1 b) │(8 b) │   (8 byte)   │(var) │
└─────────┴──────┴──────┴──────────────┴──────┘
```

## 📏 Field Data vs Doc Values

### 비교 표

| 특성 | Field Data | Doc Values |
|------|------------|------------|
| **저장 위치** | JVM Heap Memory | Disk (OS Cache) |
| **로딩 시점** | Query Time (Lazy) | Index Time |
| **메모리 사용** | 매우 높음 | 낮음 (OS Cache) |
| **성능** | 빠름 (메모리) | 적당 (Disk/Cache) |
| **GC 영향** | 크게 받음 | 받지 않음 |
| **필드 타입** | text 필드 | 모든 필드 (text 제외) |

### 사용 예시

```json
// Field Data 사용 (권장하지 않음)
{
  "mappings": {
    "properties": {
      "content": {
        "type": "text",
        "fielddata": true  // 위험!
      }
    }
  }
}

// Doc Values 사용 (기본값)
{
  "mappings": {
    "properties": {
      "price": {
        "type": "long"
        // doc_values: true (기본값)
      },
      "tags": {
        "type": "keyword"
        // doc_values: true (기본값)
      }
    }
  }
}
```

## 🛠️ Mapping 세부 구조

### Dynamic Mapping

```json
// 자동 타입 추론
{
  "name": "John",        // text/keyword
  "age": 30,            // long
  "balance": 1500.50,   // float
  "is_active": true,    // boolean
  "created": "2024-01-15" // date
}

// 생성되는 매핑
{
  "mappings": {
    "properties": {
      "name": {
        "type": "text",
        "fields": {
          "keyword": {
            "type": "keyword",
            "ignore_above": 256
          }
        }
      },
      "age": { "type": "long" },
      "balance": { "type": "float" },
      "is_active": { "type": "boolean" },
      "created": { "type": "date" }
    }
  }
}
```

### Multi-fields 구조

```json
{
  "mappings": {
    "properties": {
      "title": {
        "type": "text",
        "analyzer": "standard",
        "fields": {
          "keyword": {
            "type": "keyword"  // 정확한 매치
          },
          "korean": {
            "type": "text",
            "analyzer": "nori"  // 한국어 분석
          },
          "english": {
            "type": "text",
            "analyzer": "english"  // 영어 분석
          }
        }
      }
    }
  }
}

// 사용 예시
GET /my_index/_search
{
  "query": {
    "match": { "title.korean": "검색 엔진" }
  },
  "aggs": {
    "by_title": {
      "terms": { "field": "title.keyword" }
    }
  }
}
```

## 🔍 검색 실행 과정

### Query 실행 단계

```
╔═══════════════════════════════════════╗
║         Query Execution Flow            ║
╚═══════════════════════════════════════╝

1. Query Parsing
   │
   │  Parse JSON → Query Objects
   ▼
2. Query Rewriting  
   │
   │  Optimize & Expand Query
   ▼
3. Shard Selection
   │
   │  Determine Target Shards
   ▼
4. Query Phase (Scatter)
   │
   ├──> Shard 0: Search & Score
   ├──> Shard 1: Search & Score
   └──> Shard 2: Search & Score
   │
   ▼
5. Coordinate Node (Gather)
   │
   │  Merge & Sort Results
   ▼
6. Fetch Phase
   │
   │  Get Document Source
   ▼
7. Response
```

### Scoring 과정 (BM25)

```
BM25 Score Calculation:

score(D,Q) = ∑ IDF(qi) * TF(qi,D)

where:
- IDF = log(1 + (N - df + 0.5) / (df + 0.5))
- TF = (f(qi,D) * (k1 + 1)) / (f(qi,D) + k1 * (1 - b + b * |D| / avgdl))

예시:
Query: "elasticsearch search"
Doc1: "Elasticsearch is a search engine" (Score: 2.5)
Doc2: "Search in Elasticsearch" (Score: 2.1)
Doc3: "Database search" (Score: 0.8)
```

## 📈 성능 최적화 구조

### 캐싱 계층 구조

```
┌───────────────────────────────────────┐
│           Cache Hierarchy                │
├───────────────────────────────────────┤
│                                          │
│  1. Node Query Cache (LRU)              │
│     Size: 10% of heap                   │
│     Scope: Node level                   │
│     Content: Filter results             │
│                                          │
│  2. Shard Request Cache                 │
│     Size: 1% of heap                    │
│     Scope: Shard level                  │
│     Content: Aggregation results        │
│                                          │
│  3. OS Page Cache                       │
│     Size: Available RAM                 │
│     Scope: OS level                     │
│     Content: Segment files              │
│                                          │
└───────────────────────────────────────┘
```

### 메모리 사용 패턴

```
Heap Memory (32GB max):
┌──────────────────────────────────────┐
│  Query Cache (10%)         3.2GB       │
│  Request Cache (1%)        0.32GB      │
│  Field Data Cache          Variable    │
│  Indexing Buffer           Variable    │
│  Other JVM Objects         Remaining   │
└──────────────────────────────────────┘

Off-Heap Memory:
┌──────────────────────────────────────┐
│  OS Page Cache            Available    │
│  Doc Values (mmap)        As needed    │
│  Segments (mmap)          As needed    │
└──────────────────────────────────────┘
```

## 🎯 샤드 및 레플리카 관리

### 샤드 할당 알고리즘

```
┌───────────────────────────────────────┐
│       Shard Allocation Algorithm         │
├───────────────────────────────────────┤
│                                          │
│ 1. Allocation Decision Factors:         │
│    • Disk usage (watermarks)            │
│    • Shard count balance                │
│    • Node attributes                    │
│    • Allocation awareness               │
│                                          │
│ 2. Watermark Settings:                  │
│    Low: 85% (stop allocating)           │
│    High: 90% (start moving)             │
│    Flood: 95% (read-only)               │
│                                          │
│ 3. Rebalancing:                         │
│    threshold: 1.0                       │
│    concurrent_rebalance: 2              │
│                                          │
└───────────────────────────────────────┘
```

### Primary/Replica 동기화

```
Write Process:

     Client
       │
       ▼
  Coordinating Node
       │
       ▼
  Primary Shard
       │
   ┌───┼───┐
   ▼   ▼   ▼
  R1  R2  R3 (Parallel)
   │   │   │
   ▼   ▼   ▼
  ACK ACK ACK
       │
       ▼
    Success
```

## 🔐 보안 및 권한 관리

### X-Pack Security 구조

```
┌───────────────────────────────────────┐
│         Security Architecture            │
├───────────────────────────────────────┤
│                                          │
│  Authentication:                         │
│  • Native (internal users)              │
│  • LDAP/Active Directory               │
│  • SAML/OIDC                            │
│  • API Keys                             │
│                                          │
│  Authorization:                          │
│  • Role-Based Access Control (RBAC)    │
│  • Document Level Security (DLS)       │
│  • Field Level Security (FLS)          │
│                                          │
│  Encryption:                             │
│  • TLS/SSL for transport               │
│  • Encrypted snapshots                 │
│                                          │
│  Auditing:                               │
│  • Access logs                         │
│  • Security events                     │
│                                          │
└───────────────────────────────────────┘
```

## 🌐 클러스터 확장 패턴

### Hot-Warm-Cold Architecture

```
┌────────────────────────────────────────┐
│      Hot-Warm-Cold Architecture          │
├────────────────────────────────────────┤
│                                          │
│  HOT Nodes (SSD, High CPU/RAM):         │
│  • Recent data (0-7 days)               │
│  • Active indexing                      │
│  • Frequent queries                     │
│                                          │
│       ↓ (ILM Policy)                     │
│                                          │
│  WARM Nodes (HDD, Medium specs):        │
│  • Older data (7-30 days)               │
│  • Read-only                           │
│  • Occasional queries                   │
│                                          │
│       ↓ (ILM Policy)                     │
│                                          │
│  COLD/Frozen (Object Storage):          │
│  • Archive data (30+ days)              │
│  • Searchable snapshots                │
│  • Rare access                         │
│                                          │
└────────────────────────────────────────┘
```

## 📊 벤치마크 및 성능 지표

### 성능 측정 포인트

```
Key Performance Metrics:

1. Indexing Performance:
   • Docs/sec: 10,000-50,000
   • MB/sec: 10-100 MB/s
   • Latency: < 100ms

2. Search Performance:
   • QPS: 100-1000
   • Latency p50: < 50ms
   • Latency p99: < 200ms

3. Resource Utilization:
   • CPU: < 70%
   • Memory: < 85%
   • Disk I/O: < 80%
   • Network: < 50%

4. Cluster Health:
   • Shard count: < 1000 per node
   • Shard size: 20-40 GB
   • Segment count: < 50 per shard
```

---

💡 **다음 단계**: [Docker 환경 설정](../01-setup/README.md)에서 실습 환경을 구축해보세요!