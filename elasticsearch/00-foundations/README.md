# 🔍 Elasticsearch 핵심 개념 가이드

## 📖 Elasticsearch란 무엇인가?

Elasticsearch는 **분산형 오픈소스 검색 및 분석 엔진**입니다.  
Apache Lucene 기반으로 구축되어 실시간 검색, 로그 분석, 전문 검색 등에 사용됩니다.

### 🎯 Elasticsearch를 한 문장으로 표현하면?
> "모든 종류의 데이터를 실시간으로 검색하고 분석할 수 있는 NoSQL 검색 엔진"

## 🏗️ 핵심 구성 요소

### 1. 클러스터 (Cluster) 🌐
```
┌─────────────────────────────────────────┐
│            ES Cluster: "my-cluster"     │
├─────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  │  Node 1  │  │  Node 2  │  │  Node 3  │
│  │  Master  │  │   Data   │  │   Data   │
│  └──────────┘  └──────────┘  └──────────┘
└─────────────────────────────────────────┘
```
- **하나 이상의 노드로 구성된 집합체**
- 전체 데이터를 보유하고 검색 기능 제공
- 고유한 이름으로 식별 (기본: "elasticsearch")

### 2. 노드 (Node) 🖥️
```
┌────────────────────────────┐
│         Node Types         │
├────────────────────────────┤
│ • Master Node: 클러스터 관리 │
│ • Data Node: 데이터 저장     │
│ • Ingest Node: 데이터 전처리  │
│ • Coordinating: 요청 라우팅  │
└────────────────────────────┘
```
- **클러스터의 단일 서버 인스턴스**
- 데이터 저장 및 검색 참여
- 역할별로 구분 가능

### 3. 인덱스 (Index) 📚
```
Index: "products"
├── Document 1: { "name": "노트북", "price": 1500000 }
├── Document 2: { "name": "마우스", "price": 30000 }
└── Document 3: { "name": "키보드", "price": 80000 }
```
- **유사한 특성을 가진 도큐먼트의 집합**
- RDBMS의 Database와 유사
- 소문자로만 작성

### 4. 도큐먼트 (Document) 📄
```json
{
  "_index": "products",
  "_id": "1",
  "_source": {
    "name": "맥북 프로 16인치",
    "category": "노트북",
    "price": 3500000,
    "specs": {
      "cpu": "M3 Pro",
      "ram": "32GB",
      "storage": "1TB SSD"
    },
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```
- **인덱스의 기본 정보 단위**
- JSON 형식
- RDBMS의 Row와 유사

### 5. 샤드 (Shard) 🧩
```
Index: "logs" (3 Primary Shards, 1 Replica)
┌─────────────────────────────────────────┐
│  Primary Shards          Replica Shards │
│  ┌──────┐               ┌──────┐       │
│  │ P0   │───replica───▶ │ R0   │       │
│  └──────┘               └──────┘       │
│  ┌──────┐               ┌──────┐       │
│  │ P1   │───replica───▶ │ R1   │       │
│  └──────┘               └──────┘       │
│  ┌──────┐               ┌──────┐       │
│  │ P2   │───replica───▶ │ R2   │       │
│  └──────┘               └──────┘       │
└─────────────────────────────────────────┘
```
- **인덱스를 나눈 조각**
- Primary Shard: 원본 데이터
- Replica Shard: 복제본 (고가용성)

## 🔄 데이터 흐름 아키텍처

```
Client Request
      │
      ▼
┌─────────────────────────────────┐
│   Coordinating Node             │
│   (요청 라우팅 및 결과 병합)        │
└─────────┬───────────────────────┘
          │
    ┌─────┼─────┬─────────┐
    ▼     ▼     ▼         ▼
┌──────┐ ┌──────┐ ┌──────┐
│Data  │ │Data  │ │Data  │
│Node1 │ │Node2 │ │Node3 │
│      │ │      │ │      │
│Shard0│ │Shard1│ │Shard2│
└──────┘ └──────┘ └──────┘
    │       │       │
    └───────┼───────┘
            ▼
       Aggregated
        Response
```

## 💡 핵심 개념: 역인덱스 (Inverted Index)

### 전통적인 인덱스 vs 역인덱스
```
일반 인덱스:
Doc1 → "엘라스틱서치는 검색엔진입니다"
Doc2 → "검색엔진은 빠릅니다"

역인덱스:
"엘라스틱서치" → [Doc1]
"검색엔진"    → [Doc1, Doc2]
"빠릅니다"    → [Doc2]
```

### 역인덱스 동작 원리
```
검색어: "검색엔진"
     │
     ▼
┌─────────────┐
│ Inverted    │
│   Index     │
├─────────────┤
│"검색엔진"    │──▶ [Doc1, Doc2]
└─────────────┘
     │
     ▼
결과: Doc1, Doc2 반환
```

## 📊 매핑 (Mapping)

### 매핑이란?
```json
{
  "mappings": {
    "properties": {
      "title": {
        "type": "text",
        "analyzer": "korean"
      },
      "price": {
        "type": "integer"
      },
      "created_at": {
        "type": "date"
      },
      "is_active": {
        "type": "boolean"
      },
      "tags": {
        "type": "keyword"
      }
    }
  }
}
```
- **도큐먼트와 필드의 저장 및 인덱싱 방법 정의**
- RDBMS의 스키마와 유사
- 동적 매핑 vs 명시적 매핑

### 주요 데이터 타입
| 타입 | 설명 | 예시 |
|------|------|------|
| text | 전문 검색용 (형태소 분석) | 제목, 내용 |
| keyword | 정확한 매칭 | ID, 태그 |
| integer/long | 정수 | 수량, 나이 |
| float/double | 실수 | 가격, 비율 |
| date | 날짜/시간 | 생성일 |
| boolean | 참/거짓 | 활성화 상태 |
| object | 중첩 객체 | 사용자 정보 |
| nested | 중첩 배열 | 댓글 목록 |

## 🔍 분석기 (Analyzer)

### 분석 과정
```
원문: "Elasticsearch는 최고의 검색엔진입니다!"
          │
          ▼
    Character Filter
    (특수문자 제거)
          │
          ▼
      Tokenizer
    (토큰으로 분리)
          │
          ▼
    Token Filter
   (소문자 변환, 불용어 제거)
          │
          ▼
결과: [elasticsearch, 최고, 검색엔진]
```

### 한글 분석기 (Nori)
```
원문: "엘라스틱서치를 공부하고 있습니다"
          │
          ▼
     Nori Analyzer
          │
          ▼
토큰: [엘라스틱서치, 공부, 하고, 있습니다]
```

## 🎯 주요 사용 사례

### 1. 전문 검색 (Full-Text Search) 🔤
```
사용자 검색: "맛있는 피자"
          │
          ▼
    Query 분석
          │
          ▼
   관련 문서 검색
          │
          ▼
결과: 
- "강남의 맛있는 피자 맛집"     (Score: 0.95)
- "피자가 정말 맛있어요"        (Score: 0.87)
- "맛있는 파스타와 피자"        (Score: 0.82)
```

### 2. 로그 분석 (Log Analytics) 📈
```
Application Logs ──┐
System Logs ───────┼──▶ Elasticsearch ──▶ Kibana Dashboard
Access Logs ───────┘
```

### 3. 실시간 분석 (Real-time Analytics) ⚡
```
실시간 데이터 스트림
       │
       ▼
  Elasticsearch
       │
   ┌───┼───┐
   ▼   ▼   ▼
Alert  Dashboard  Report
```

### 4. 지리공간 검색 (Geo-spatial Search) 🗺️
```json
{
  "query": {
    "geo_distance": {
      "distance": "10km",
      "location": {
        "lat": 37.5665,
        "lon": 126.9780
      }
    }
  }
}
```

## 🚀 RESTful API

### 기본 작업 (CRUD)
```bash
# Create - 문서 생성
PUT /products/_doc/1
{
  "name": "노트북",
  "price": 1500000
}

# Read - 문서 조회
GET /products/_doc/1

# Update - 문서 수정
POST /products/_update/1
{
  "doc": {
    "price": 1400000
  }
}

# Delete - 문서 삭제
DELETE /products/_doc/1

# Search - 검색
GET /products/_search
{
  "query": {
    "match": {
      "name": "노트북"
    }
  }
}
```

## 📈 클러스터 상태

### Green, Yellow, Red 상태
```
┌────────────────────────────────────┐
│ 🟢 Green: 모든 샤드 정상            │
│    - Primary: ✓                    │
│    - Replica: ✓                    │
├────────────────────────────────────┤
│ 🟡 Yellow: Primary만 정상           │
│    - Primary: ✓                    │
│    - Replica: ✗                    │
├────────────────────────────────────┤
│ 🔴 Red: Primary 샤드 손실           │
│    - Primary: ✗                    │
│    - Replica: ✗                    │
└────────────────────────────────────┘
```

## 🔑 핵심 개념 요약

| 개념 | 설명 | SQL 대응 |
|------|------|----------|
| **Cluster** | 노드들의 집합 | DB 서버 그룹 |
| **Node** | 단일 ES 인스턴스 | DB 서버 |
| **Index** | 문서들의 논리적 집합 | Database |
| **Type** | (deprecated) | Table |
| **Document** | JSON 데이터 | Row |
| **Field** | 문서의 속성 | Column |
| **Mapping** | 필드 타입 정의 | Schema |
| **Shard** | 인덱스 분할 단위 | Partition |

## 🚦 시작하기 전 알아야 할 것

### ✅ Elasticsearch가 적합한 경우
- 전문 검색이 필요한 경우
- 로그 수집 및 분석
- 실시간 데이터 분석
- 자동완성 기능 구현
- 복잡한 집계 쿼리

### ❌ Elasticsearch가 부적합한 경우
- 강한 일관성(ACID)이 필요한 경우
- 복잡한 조인 연산
- 실시간 트랜잭션 처리
- 작은 데이터셋 (오버헤드)

## 🎓 다음 학습 단계

1. **환경 구축** → [01-setup](../01-setup/README.md)
2. **인덱싱 학습** → [02-indexing](../02-indexing/README.md)
3. **검색 마스터** → [03-searching](../03-searching/README.md)
4. **고급 기능** → [04-advanced](../04-advanced/README.md)

---

💡 **학습 팁**: Elasticsearch는 실습이 중요합니다. 각 개념을 Kibana Dev Tools에서 직접 실행해보면서 이해하세요!