# 🏗️ Elasticsearch 아키텍처 심층 분석

## 📐 전체 아키텍처 개요

```
┌──────────────────────────────────────────────────────────┐
│                    Client Applications                    │
│         (Web Apps, Mobile Apps, Analytics Tools)          │
└────────────────────┬─────────────────────────────────────┘
                     │ REST API (HTTP/HTTPS)
                     ▼
┌──────────────────────────────────────────────────────────┐
│                    Load Balancer                          │
│                  (HAProxy, Nginx, AWS ELB)                │
└────────────────────┬─────────────────────────────────────┘
                     │
      ┌──────────────┼──────────────┬──────────────┐
      ▼              ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  Node 1  │  │  Node 2  │  │  Node 3  │  │  Node 4  │
│  Master  │  │   Data   │  │   Data   │  │  Ingest  │
│Eligible  │  │          │  │          │  │          │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
      │              │              │              │
      └──────────────┴──────────────┴──────────────┘
                    Cluster Network
```

## 🎯 노드 역할과 책임

### 1. Master Node (마스터 노드)

```
┌─────────────────────────────────────┐
│          Master Node                │
├─────────────────────────────────────┤
│ • 클러스터 상태 관리                  │
│ • 인덱스 생성/삭제                    │
│ • 샤드 할당 결정                      │
│ • 노드 추가/제거 감지                 │
│ • 클러스터 메타데이터 관리             │
└─────────────────────────────────────┘
```

**주요 기능:**
- **클러스터 상태 관리**: 전체 클러스터의 메타데이터와 상태 정보 유지
- **샤드 할당**: 어느 노드에 어떤 샤드를 배치할지 결정
- **인덱스 관리**: 인덱스 생성, 삭제, 설정 변경 처리

**설정 예시:**
```yaml
node.roles: [ master ]
node.name: master-node-01
cluster.initial_master_nodes: ["master-node-01"]
```

### 2. Data Node (데이터 노드)

```
┌─────────────────────────────────────┐
│           Data Node                 │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │     Shard Storage                │ │
│ │  ┌──────┐  ┌──────┐  ┌──────┐  │ │
│ │  │ P0   │  │ R1   │  │ P2   │  │ │
│ │  └──────┘  └──────┘  └──────┘  │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │     Lucene Engine                │ │
│ │  • Indexing                      │ │
│ │  • Searching                     │ │
│ │  • Aggregations                  │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**주요 기능:**
- **데이터 저장**: 실제 문서 데이터와 인덱스 저장
- **검색 실행**: 쿼리 처리 및 결과 반환
- **인덱싱**: 새 문서 색인 및 업데이트

### 3. Ingest Node (인제스트 노드)

```
┌─────────────────────────────────────┐
│          Ingest Node                │
├─────────────────────────────────────┤
│   Raw Data → Pipeline → Indexed    │
│                                     │
│   Pipeline Processors:              │
│   • Grok (패턴 매칭)                 │
│   • Date (날짜 파싱)                 │
│   • GeoIP (IP 위치 변환)             │
│   • Script (스크립트 처리)           │
└─────────────────────────────────────┘
```

**파이프라인 예시:**
```json
{
  "description": "로그 처리 파이프라인",
  "processors": [
    {
      "grok": {
        "field": "message",
        "patterns": ["%{COMMONAPACHELOG}"]
      }
    },
    {
      "date": {
        "field": "timestamp",
        "formats": ["dd/MMM/yyyy:HH:mm:ss Z"]
      }
    },
    {
      "geoip": {
        "field": "client_ip"
      }
    }
  ]
}
```

### 4. Coordinating Node (코디네이팅 노드)

```
┌─────────────────────────────────────┐
│       Coordinating Node             │
├─────────────────────────────────────┤
│   Client Request                    │
│      ↓                              │
│   Route to Data Nodes               │
│      ↓                              │
│   Gather Results                    │
│      ↓                              │
│   Merge & Sort                      │
│      ↓                              │
│   Return to Client                  │
└─────────────────────────────────────┘
```

## 🔄 데이터 흐름

### 인덱싱 프로세스

```
1. Document Input
      ↓
2. Ingest Pipeline (Optional)
      ↓
3. Primary Shard Selection
      ↓
4. Document Indexing
      ↓
5. Replication to Replica Shards
      ↓
6. Refresh (Near Real-time Search)
      ↓
7. Flush & Commit (Durability)
```

### 검색 프로세스

```
Query Request
      ↓
┌─────────────────────────────┐
│   Query Phase               │
│   • 각 샤드에 쿼리 전달       │
│   • 관련 문서 ID 수집         │
│   • 스코어 계산              │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│   Fetch Phase               │
│   • 실제 문서 가져오기        │
│   • 결과 병합                │
│   • 최종 정렬                │
└─────────────┬───────────────┘
              ↓
         Response
```

## 💾 저장 구조

### Segment 구조

```
┌──────────────────────────────────────┐
│           Lucene Index               │
├──────────────────────────────────────┤
│  ┌──────────────────────────────┐    │
│  │      Segment 1                │    │
│  │  • Inverted Index             │    │
│  │  • Stored Fields              │    │
│  │  • Term Vectors               │    │
│  │  • Doc Values                 │    │
│  └──────────────────────────────┘    │
│  ┌──────────────────────────────┐    │
│  │      Segment 2                │    │
│  └──────────────────────────────┘    │
│  ┌──────────────────────────────┐    │
│  │      Segment N                │    │
│  └──────────────────────────────┘    │
└──────────────────────────────────────┘
```

**Segment 특성:**
- **불변성**: 한 번 생성되면 수정 불가
- **병합**: 백그라운드에서 작은 세그먼트들을 큰 것으로 병합
- **삭제**: 삭제 마킹 후 병합 시 실제 제거

### Translog (트랜잭션 로그)

```
┌──────────────────────────────────────┐
│         Write Operation              │
└────────────┬─────────────────────────┘
             ▼
      ┌──────────────┐
      │   Memory     │
      │   Buffer     │
      └──────┬───────┘
             │
      ┌──────▼───────┐
      │   Translog   │ ← Durability
      └──────────────┘
             │
      ┌──────▼───────┐
      │   Segment    │ ← Searchable
      └──────────────┘
```

## 🔐 클러스터 통신

### Discovery & Cluster Formation

```yaml
# elasticsearch.yml
discovery.seed_hosts:
  - node1.example.com
  - node2.example.com
  - node3.example.com

cluster.initial_master_nodes:
  - node-1
  - node-2
  - node-3

# Transport Layer Security
xpack.security.transport.ssl.enabled: true
xpack.security.transport.ssl.verification_mode: certificate
```

### 노드 간 통신 프로토콜

```
┌────────────────────────────────────┐
│         Transport Protocol         │
├────────────────────────────────────┤
│  • Binary Protocol (Port 9300)     │
│  • Persistent Connections          │
│  • Compression Support             │
│  • TLS/SSL Encryption             │
└────────────────────────────────────┘
```

## 🎛️ 샤드 할당 전략

### 샤드 분배 알고리즘

```
┌──────────────────────────────────────┐
│       Shard Allocation Decision      │
├──────────────────────────────────────┤
│  Factors:                            │
│  • Disk Usage (< 85%)                │
│  • Node Load                         │
│  • Shard Count Balance               │
│  • Allocation Awareness              │
│  • Forced Awareness                  │
└──────────────────────────────────────┘
```

**Allocation Awareness 예시:**
```json
{
  "persistent": {
    "cluster.routing.allocation.awareness.attributes": "rack_id,zone",
    "cluster.routing.allocation.awareness.force.zone.values": "zone1,zone2"
  }
}
```

## 🚀 성능 최적화 아키텍처

### 캐싱 계층

```
┌──────────────────────────────────────┐
│           Caching Layers             │
├──────────────────────────────────────┤
│  1. Node Query Cache                 │
│     • LRU Cache                      │
│     • 10% of Heap (default)          │
│                                      │
│  2. Shard Request Cache              │
│     • Result Cache                   │
│     • 1% of Heap (default)           │
│                                      │
│  3. Field Data Cache                 │
│     • In-memory Data Structure       │
│     • Unbounded (careful!)           │
└──────────────────────────────────────┘
```

### Thread Pool 구조

```
┌──────────────────────────────────────┐
│          Thread Pools                │
├──────────────────────────────────────┤
│  search:                             │
│    • threads: # of processors        │
│    • queue: 1000                     │
│                                      │
│  index:                              │
│    • threads: # of processors        │
│    • queue: 200                      │
│                                      │
│  bulk:                               │
│    • threads: # of processors        │
│    • queue: 50                       │
└──────────────────────────────────────┘
```

## 🔧 고가용성 설계

### Multi-Zone Deployment

```
┌──────────────────────────────────────────────┐
│              Availability Zone 1             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Master 1 │  │  Data 1  │  │  Data 2  │  │
│  └──────────┘  └──────────┘  └──────────┘  │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│              Availability Zone 2             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Master 2 │  │  Data 3  │  │  Data 4  │  │
│  └──────────┘  └──────────┘  └──────────┘  │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│              Availability Zone 3             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Master 3 │  │  Data 5  │  │  Data 6  │  │
│  └──────────┘  └──────────┘  └──────────┘  │
└──────────────────────────────────────────────┘
```

### Split Brain Prevention

```yaml
# Minimum master nodes (deprecated in 7.x)
# discovery.zen.minimum_master_nodes: 2

# Modern approach (7.x+)
cluster.initial_master_nodes:
  - master-1
  - master-2
  - master-3

# Voting configuration
# Automatically managed in 7.x+
```

## 📊 모니터링 포인트

### 주요 메트릭

```
┌──────────────────────────────────────┐
│       Key Monitoring Metrics         │
├──────────────────────────────────────┤
│  Cluster Level:                      │
│  • cluster.health                    │
│  • nodes.count                       │
│  • indices.count                     │
│  • shards.active                     │
│                                      │
│  Node Level:                         │
│  • cpu.percent                       │
│  • memory.used_percent               │
│  • disk.used_percent                 │
│  • thread_pool.rejected              │
│                                      │
│  Index Level:                        │
│  • indexing.index_rate               │
│  • search.query_rate                 │
│  • segments.count                    │
└──────────────────────────────────────┘
```

## 🎓 베스트 프랙티스

### 1. 노드 구성
- **마스터 노드**: 최소 3개 (홀수 개수 유지)
- **데이터 노드**: CPU와 메모리보다 디스크 중요
- **인제스트 노드**: 무거운 전처리 시 별도 구성

### 2. 샤드 설계
- **Primary 샤드**: 인덱스 생성 시 결정 (변경 불가)
- **Replica 샤드**: 동적 조정 가능
- **샤드 크기**: 20-40GB 권장

### 3. 메모리 설정
```bash
# JVM Heap (시스템 메모리의 50% 이하, 최대 32GB)
export ES_JAVA_OPTS="-Xms16g -Xmx16g"

# 나머지 50%는 OS 파일 시스템 캐시용
```

---

💡 **다음 단계**: [용어 사전](./terminology.md)에서 Elasticsearch 핵심 용어를 확인하세요!