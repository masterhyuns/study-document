# 📥 Elasticsearch 인덱싱 및 매핑 가이드

## 🎯 목표

Elasticsearch의 인덱싱 및 매핑 기능을 마스터하고 효율적인 데이터 구조를 설계합니다.

## 📝 인덱스 기본 개념

### 인덱스 생성

```bash
# 기본 인덱스 생성
PUT /my-index

# 설정과 함께 인덱스 생성
PUT /products
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "refresh_interval": "5s",
    "max_result_window": 10000
  }
}

# 매핑과 설정을 함께 생성
PUT /products-v2
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "my_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "stop"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "title": {
        "type": "text",
        "analyzer": "my_analyzer"
      },
      "price": {
        "type": "float"
      }
    }
  }
}
```

### 인덱스 관리

```bash
# 인덱스 목록 확인
GET /_cat/indices?v

# 인덱스 상세 정보
GET /products

# 인덱스 설정 확인
GET /products/_settings

# 인덱스 매핑 확인
GET /products/_mapping

# 인덱스 통계
GET /products/_stats

# 인덱스 삭제
DELETE /products

# 인덱스 닫기/열기
POST /products/_close
POST /products/_open
```

## 🗺️ 매핑 (Mapping)

### 데이터 타입

```json
// 전체 매핑 예시
PUT /comprehensive-index
{
  "mappings": {
    "properties": {
      // Text 타입 - 전문 검색용
      "title": {
        "type": "text",
        "analyzer": "standard",
        "search_analyzer": "standard",
        "boost": 2.0,
        "index": true,
        "store": false,
        "fields": {
          "keyword": {
            "type": "keyword",
            "ignore_above": 256
          },
          "korean": {
            "type": "text",
            "analyzer": "nori"
          }
        }
      },
      
      // Keyword 타입 - 정확한 매칭, 집계용
      "category": {
        "type": "keyword",
        "null_value": "UNKNOWN"
      },
      
      // 숫자 타입들
      "price": {
        "type": "float",
        "null_value": 0.0
      },
      "quantity": {
        "type": "integer"
      },
      "rating": {
        "type": "half_float"
      },
      "view_count": {
        "type": "long"
      },
      
      // 날짜 타입
      "created_at": {
        "type": "date",
        "format": "yyyy-MM-dd HH:mm:ss||yyyy-MM-dd||epoch_millis"
      },
      
      // Boolean 타입
      "is_active": {
        "type": "boolean"
      },
      
      // Object 타입 (중첩 객체)
      "manufacturer": {
        "properties": {
          "name": {
            "type": "text",
            "fields": {
              "keyword": {
                "type": "keyword"
              }
            }
          },
          "country": {
            "type": "keyword"
          },
          "established": {
            "type": "date"
          }
        }
      },
      
      // Nested 타입 (배열 내 객체 보존)
      "reviews": {
        "type": "nested",
        "properties": {
          "user": {
            "type": "keyword"
          },
          "rating": {
            "type": "float"
          },
          "comment": {
            "type": "text"
          },
          "date": {
            "type": "date"
          }
        }
      },
      
      // 지리적 데이터 타입
      "location": {
        "type": "geo_point"
      },
      "service_area": {
        "type": "geo_shape",
        "strategy": "recursive"
      },
      
      // IP 주소 타입
      "ip_address": {
        "type": "ip"
      },
      
      // 범위 타입
      "price_range": {
        "type": "integer_range"
      },
      
      // Completion 타입 (자동완성)
      "suggest": {
        "type": "completion",
        "analyzer": "simple",
        "search_analyzer": "simple"
      },
      
      // Percolator 타입
      "query": {
        "type": "percolator"
      },
      
      // Join 타입 (부모-자식 관계)
      "join_field": {
        "type": "join",
        "relations": {
          "product": "variant"
        }
      }
    }
  }
}
```

### Dynamic Mapping vs Explicit Mapping

```json
// Dynamic Mapping 제어
PUT /strict-index
{
  "mappings": {
    "dynamic": "strict",  // strict, false, true
    "properties": {
      "title": { "type": "text" },
      "price": { "type": "float" }
    }
  }
}

// Dynamic Templates
PUT /template-index
{
  "mappings": {
    "dynamic_templates": [
      {
        "strings_as_keywords": {
          "match_mapping_type": "string",
          "match": "*_id",
          "mapping": {
            "type": "keyword"
          }
        }
      },
      {
        "longs_as_strings": {
          "match_mapping_type": "long",
          "match": "*_count",
          "mapping": {
            "type": "keyword"
          }
        }
      },
      {
        "korean_text": {
          "match": "*_ko",
          "mapping": {
            "type": "text",
            "analyzer": "nori"
          }
        }
      }
    ],
    "properties": {
      "title": { "type": "text" }
    }
  }
}
```

## 📤 문서 인덱싱

### 단일 문서 인덱싱

```json
// ID 자동 생성
POST /products/_doc
{
  "title": "Elasticsearch Guide",
  "price": 35000
}

// ID 지정
PUT /products/_doc/1
{
  "title": "Elasticsearch Guide",
  "price": 35000
}

// Create (ID가 이미 존재하면 실패)
PUT /products/_create/1
{
  "title": "Elasticsearch Guide",
  "price": 35000
}

// Upsert 패턴
POST /products/_update/1
{
  "script": {
    "source": "ctx._source.view_count += params.count",
    "params": {
      "count": 1
    }
  },
  "upsert": {
    "title": "New Product",
    "view_count": 1
  }
}
```

### Bulk API

```json
// Bulk 인덱싱
POST /_bulk
{ "index": { "_index": "products", "_id": "1" } }
{ "title": "Product 1", "price": 10000 }
{ "create": { "_index": "products", "_id": "2" } }
{ "title": "Product 2", "price": 20000 }
{ "update": { "_index": "products", "_id": "1" } }
{ "doc": { "price": 12000 } }
{ "delete": { "_index": "products", "_id": "3" } }
```

### 조건부 업데이트

```json
// if_seq_no & if_primary_term
PUT /products/_doc/1?if_seq_no=0&if_primary_term=1
{
  "title": "Updated Product",
  "price": 25000
}

// version
PUT /products/_doc/1?version=1&version_type=external
{
  "title": "Version Controlled Product",
  "price": 30000
}
```

## 🔄 Reindex

### 기본 Reindex

```json
// 단순 Reindex
POST _reindex
{
  "source": {
    "index": "products-v1"
  },
  "dest": {
    "index": "products-v2"
  }
}

// 선택적 Reindex
POST _reindex
{
  "source": {
    "index": "products-v1",
    "query": {
      "range": {
        "price": {
          "gte": 10000
        }
      }
    },
    "_source": ["title", "price", "category"]
  },
  "dest": {
    "index": "products-v2"
  }
}

// Script를 사용한 Reindex
POST _reindex
{
  "source": {
    "index": "products-v1"
  },
  "dest": {
    "index": "products-v2"
  },
  "script": {
    "source": """
      ctx._source.price = ctx._source.price * 1.1;
      ctx._source.updated_at = params.now;
    """,
    "params": {
      "now": "2024-01-15T10:00:00Z"
    }
  }
}

// 원격 클러스터에서 Reindex
POST _reindex
{
  "source": {
    "remote": {
      "host": "http://remote-cluster:9200",
      "username": "user",
      "password": "pass"
    },
    "index": "products",
    "query": {
      "match_all": {}
    }
  },
  "dest": {
    "index": "products-local"
  }
}
```

## 🌐 한국어 처리 (Nori Analyzer)

### Nori Analyzer 설정

```json
PUT /korean-index
{
  "settings": {
    "analysis": {
      "tokenizer": {
        "nori_user_dict": {
          "type": "nori_tokenizer",
          "decompound_mode": "mixed",
          "user_dictionary_rules": [
            "엘라스틱서치",
            "아파치 루심",
            "노리 분석기"
          ]
        }
      },
      "filter": {
        "nori_stop": {
          "type": "nori_part_of_speech",
          "stoptags": [
            "E",
            "IC",
            "J",
            "MAG",
            "MM",
            "SP",
            "SSC",
            "SSO",
            "SC",
            "SE",
            "XPN",
            "XSA",
            "XSN",
            "XSV",
            "UNA",
            "NA",
            "VSV"
          ]
        },
        "nori_readingform": {
          "type": "nori_readingform"
        }
      },
      "analyzer": {
        "korean_analyzer": {
          "type": "custom",
          "tokenizer": "nori_user_dict",
          "filter": [
            "nori_stop",
            "nori_readingform",
            "lowercase"
          ]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "title": {
        "type": "text",
        "analyzer": "korean_analyzer",
        "search_analyzer": "korean_analyzer"
      },
      "content": {
        "type": "text",
        "analyzer": "korean_analyzer"
      }
    }
  }
}
```

### 분석기 테스트

```json
// Analyzer 테스트
POST /korean-index/_analyze
{
  "analyzer": "korean_analyzer",
  "text": "엘라스틱서치는 검색엔진입니다"
}

// 결과
{
  "tokens": [
    {
      "token": "엘라스틱서치",
      "start_offset": 0,
      "end_offset": 6,
      "type": "word",
      "position": 0
    },
    {
      "token": "검색",
      "start_offset": 8,
      "end_offset": 10,
      "type": "word",
      "position": 2
    },
    {
      "token": "엔진",
      "start_offset": 10,
      "end_offset": 12,
      "type": "word",
      "position": 3
    }
  ]
}
```

## 🌡️ Index Templates

### Template 생성

```json
// Index Template 생성
PUT _index_template/logs-template
{
  "index_patterns": ["logs-*"],
  "priority": 100,
  "template": {
    "settings": {
      "number_of_shards": 3,
      "number_of_replicas": 1,
      "refresh_interval": "5s",
      "lifecycle": {
        "name": "logs-policy",
        "rollover_alias": "logs"
      }
    },
    "mappings": {
      "properties": {
        "@timestamp": {
          "type": "date"
        },
        "message": {
          "type": "text"
        },
        "level": {
          "type": "keyword"
        },
        "host": {
          "type": "keyword"
        }
      }
    },
    "aliases": {
      "logs": {}
    }
  },
  "composed_of": ["common-settings", "common-mappings"],
  "_meta": {
    "description": "Template for log indices",
    "created_by": "admin"
  }
}

// Component Template
PUT _component_template/common-settings
{
  "template": {
    "settings": {
      "index.codec": "best_compression",
      "index.max_result_window": 50000
    }
  }
}
```

## 🔄 Index Lifecycle Management (ILM)

### ILM Policy 설정

```json
PUT _ilm/policy/logs-policy
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_age": "7d",
            "max_size": "50GB",
            "max_docs": 100000000
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
          "forcemerge": {
            "max_num_segments": 1
          },
          "set_priority": {
            "priority": 50
          },
          "allocate": {
            "require": {
              "box_type": "warm"
            }
          }
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": {
          "set_priority": {
            "priority": 0
          },
          "allocate": {
            "require": {
              "box_type": "cold"
            }
          },
          "searchable_snapshot": {
            "snapshot_repository": "my_repository"
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

## 📊 인덱싱 성능 최적화

### 성능 튜닝 설정

```json
PUT /optimized-index
{
  "settings": {
    // 기본 설정
    "number_of_shards": 5,
    "number_of_replicas": 1,
    
    // Refresh 최적화
    "refresh_interval": "30s",  // 대량 인덱싱 시 -1로 설정
    
    // Translog 설정
    "translog.durability": "async",
    "translog.sync_interval": "5s",
    "translog.flush_threshold_size": "512mb",
    
    // Merge 설정
    "merge.scheduler.max_thread_count": 2,
    "merge.policy.max_merged_segment": "5gb",
    
    // Indexing Buffer
    "indices.memory.index_buffer_size": "30%",
    
    // 압축 설정
    "codec": "best_compression",
    
    // 분석 설정
    "analysis": {
      "analyzer": {
        "optimized_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "asciifolding"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "text_field": {
        "type": "text",
        "analyzer": "optimized_analyzer",
        "index_options": "freqs",  // positions 제거
        "norms": false  // scoring에 필요하지 않으면 false
      },
      "keyword_field": {
        "type": "keyword",
        "doc_values": true,  // 정렬/집계에 필요
        "eager_global_ordinals": true  // 빈번한 terms 집계 시
      },
      "numeric_field": {
        "type": "long",
        "index": false  // 검색하지 않을 경우
      }
    }
  }
}
```

### Bulk 인덱싱 베스트 프랙티스

```python
# Python 예시
from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk, parallel_bulk
import json

es = Elasticsearch(['localhost:9200'])

# 대량 인덱싱 전 설정
def prepare_for_bulk_indexing(index_name):
    # Refresh 비활성화
    es.indices.put_settings(
        index=index_name,
        body={"refresh_interval": -1}
    )
    
    # Replica 제거
    es.indices.put_settings(
        index=index_name,
        body={"number_of_replicas": 0}
    )

# Bulk 인덱싱
def bulk_index_data(index_name, data):
    actions = [
        {
            "_index": index_name,
            "_source": doc
        }
        for doc in data
    ]
    
    # Parallel bulk for better performance
    for success, info in parallel_bulk(
        es,
        actions,
        chunk_size=500,
        thread_count=4
    ):
        if not success:
            print(f"Failed: {info}")

# 인덱싱 후 설정 복구
def restore_after_bulk_indexing(index_name):
    # Refresh 활성화
    es.indices.put_settings(
        index=index_name,
        body={"refresh_interval": "5s"}
    )
    
    # Replica 복구
    es.indices.put_settings(
        index=index_name,
        body={"number_of_replicas": 1}
    )
    
    # Force merge
    es.indices.forcemerge(
        index=index_name,
        max_num_segments=1
    )
```

## 🔧 Ingest Pipeline

### Pipeline 생성과 사용

```json
// Ingest Pipeline 생성
PUT _ingest/pipeline/product-pipeline
{
  "description": "Product data processing pipeline",
  "processors": [
    {
      "set": {
        "field": "@timestamp",
        "value": "{{_ingest.timestamp}}"
      }
    },
    {
      "lowercase": {
        "field": "category"
      }
    },
    {
      "convert": {
        "field": "price",
        "type": "float",
        "ignore_failure": true
      }
    },
    {
      "script": {
        "source": """
          if (ctx.price != null && ctx.price > 1000000) {
            ctx.price_category = 'premium';
          } else if (ctx.price != null && ctx.price > 100000) {
            ctx.price_category = 'standard';
          } else {
            ctx.price_category = 'budget';
          }
        """
      }
    },
    {
      "remove": {
        "field": "temp_field",
        "ignore_failure": true
      }
    }
  ],
  "on_failure": [
    {
      "set": {
        "field": "_index",
        "value": "failed-products"
      }
    },
    {
      "set": {
        "field": "error",
        "value": "{{_ingest.on_failure_message}}"
      }
    }
  ]
}

// Pipeline 사용
POST /products/_doc?pipeline=product-pipeline
{
  "title": "New Product",
  "category": "ELECTRONICS",
  "price": "2500000"
}

// Pipeline 테스트
POST _ingest/pipeline/_simulate
{
  "pipeline": {
    "processors": [
      {
        "lowercase": {
          "field": "category"
        }
      }
    ]
  },
  "docs": [
    {
      "_source": {
        "category": "ELECTRONICS"
      }
    }
  ]
}
```

## 🎯 베스트 프랙티스

### 1. 샤드 설계
- **샤드 크기**: 20-40GB 유지
- **샤드 수**: 노드 수와 데이터 크기 고려
- **핫 인덱스**: SSD에 배치

### 2. 매핑 최적화
- 불필요한 필드는 `index: false`
- 집계만 하는 필드는 `doc_values: true`
- 검색만 하는 text 필드는 `doc_values: false`

### 3. 대량 인덱싱
- Refresh interval 일시 비활성화
- Replica 제거 후 나중에 추가
- Bulk API 사용 (chunk size: 5-15MB)

### 4. 모니터링
```bash
# 인덱싱 속도 확인
GET /_cat/thread_pool/write?v&h=node_name,name,active,rejected,completed

# 세그먼트 상태 확인
GET /_cat/segments/products?v&h=index,shard,segment,size,size.memory
```

---

💡 **다음 단계**: [검색 및 집계](../03-searching/README.md)에서 강력한 검색 기능을 학습해보세요!