# 🔍 Elasticsearch 검색 및 집계 마스터 가이드

## 🎯 목표

Elasticsearch의 강력한 검색 기능과 집계를 활용하여 복잡한 데이터 분석을 수행합니다.

## 📚 Query DSL (Domain Specific Language)

### Query Context vs Filter Context

```
┌────────────────────────────────────────────────┐
│           Query Execution Context              │
├────────────────────────────────────────────────┤
│                                                │
│  Query Context (점수 계산)                      │
│  • "얼마나 잘 매칭되는가?"                      │
│  • _score 계산                                 │
│  • 캐시 안됨                                   │
│                                                │
│  Filter Context (Yes/No)                       │
│  • "매칭되는가 안되는가?"                       │
│  • 점수 계산 없음                              │
│  • 캐시됨                                      │
│                                                │
└────────────────────────────────────────────────┘
```

### 기본 구조

```json
GET /products/_search
{
  "query": {  // Query Context
    "bool": {
      "must": [  // AND 조건 + 스코어 영향
        {
          "match": {
            "title": "elasticsearch"
          }
        }
      ],
      "filter": [  // AND 조건 + 스코어 영향 없음
        {
          "range": {
            "price": {
              "gte": 10000,
              "lte": 100000
            }
          }
        }
      ],
      "should": [  // OR 조건 + 스코어 부스트
        {
          "term": {
            "brand.keyword": "Samsung"
          }
        }
      ],
      "must_not": [  // NOT 조건
        {
          "term": {
            "status": "discontinued"
          }
        }
      ],
      "minimum_should_match": 1,
      "boost": 2.0
    }
  },
  "from": 0,
  "size": 10,
  "sort": [
    { "_score": "desc" },
    { "created_at": "desc" }
  ],
  "_source": ["title", "price", "brand"],
  "highlight": {
    "fields": {
      "title": {}
    }
  }
}
```

## 🔎 Full-text Queries

### Match Query

```json
// 기본 Match
GET /products/_search
{
  "query": {
    "match": {
      "title": "elasticsearch guide"
    }
  }
}

// 옵션 포함 Match
GET /products/_search
{
  "query": {
    "match": {
      "title": {
        "query": "elasticsearch guide",
        "operator": "and",  // or (기본값), and
        "minimum_should_match": "75%",
        "fuzziness": "AUTO",  // 오타 허용
        "prefix_length": 2,
        "max_expansions": 50,
        "analyzer": "standard",
        "zero_terms_query": "all",  // none, all
        "boost": 2.0
      }
    }
  }
}

// Match Phrase (구문 검색)
GET /products/_search
{
  "query": {
    "match_phrase": {
      "description": {
        "query": "quick brown fox",
        "slop": 2  // 단어 간 거리 허용치
      }
    }
  }
}

// Match Phrase Prefix (자동완성)
GET /products/_search
{
  "query": {
    "match_phrase_prefix": {
      "title": {
        "query": "elasticsear",
        "max_expansions": 10
      }
    }
  }
}

// Multi Match (여러 필드 검색)
GET /products/_search
{
  "query": {
    "multi_match": {
      "query": "elasticsearch",
      "fields": [
        "title^3",  // 부스트 3
        "description^2",  // 부스트 2
        "tags",
        "*.korean"  // 와일드카드
      ],
      "type": "best_fields",  // best_fields, most_fields, cross_fields, phrase, phrase_prefix
      "tie_breaker": 0.3,
      "minimum_should_match": "30%"
    }
  }
}
```

### Query String Query

```json
// Simple Query String
GET /products/_search
{
  "query": {
    "simple_query_string": {
      "query": "\"fried eggs\" +(eggplant | potato) -frittata",
      "fields": ["title^2", "description"],
      "default_operator": "and",
      "flags": "OR|AND|PREFIX",
      "minimum_should_match": "2"
    }
  }
}

// Query String (Lucene 문법)
GET /products/_search
{
  "query": {
    "query_string": {
      "query": "(title:\"elasticsearch\" OR description:search) AND category:book",
      "default_field": "*",
      "allow_leading_wildcard": false,
      "analyze_wildcard": true,
      "fuzzy_max_expansions": 50,
      "fuzziness": "AUTO",
      "phrase_slop": 0
    }
  }
}
```

## 🎯 Term-level Queries

### Term & Terms Query

```json
// Term Query (정확한 매치)
GET /products/_search
{
  "query": {
    "term": {
      "status.keyword": {
        "value": "active",
        "boost": 2.0,
        "case_insensitive": true
      }
    }
  }
}

// Terms Query (여러 값 중 하나)
GET /products/_search
{
  "query": {
    "terms": {
      "category.keyword": ["electronics", "computers", "smartphones"],
      "boost": 1.0
    }
  }
}

// Terms Set Query (최소 매치 개수)
GET /products/_search
{
  "query": {
    "terms_set": {
      "tags": {
        "terms": ["elasticsearch", "search", "database"],
        "minimum_should_match_field": "required_matches"
      }
    }
  }
}
```

### Range Query

```json
GET /products/_search
{
  "query": {
    "range": {
      "price": {
        "gte": 10000,
        "lte": 50000,
        "boost": 2.0
      }
    }
  }
}

// 날짜 Range
GET /products/_search
{
  "query": {
    "range": {
      "created_at": {
        "gte": "2024-01-01",
        "lte": "now",
        "format": "yyyy-MM-dd",
        "time_zone": "+09:00"
      }
    }
  }
}

// 상대적 날짜
GET /products/_search
{
  "query": {
    "range": {
      "created_at": {
        "gte": "now-7d/d",  // 7일 전 시작
        "lte": "now/d"      // 오늘 끝
      }
    }
  }
}
```

### Wildcard & Regex Queries

```json
// Wildcard Query
GET /products/_search
{
  "query": {
    "wildcard": {
      "title.keyword": {
        "value": "elast*search",
        "boost": 1.0,
        "case_insensitive": true
      }
    }
  }
}

// Prefix Query
GET /products/_search
{
  "query": {
    "prefix": {
      "title.keyword": {
        "value": "elastic",
        "case_insensitive": true
      }
    }
  }
}

// Regexp Query
GET /products/_search
{
  "query": {
    "regexp": {
      "title.keyword": {
        "value": "[0-9]{4}-[0-9]{2}-[0-9]{2}",
        "flags": "INTERSECTION|COMPLEMENT|EMPTY",
        "max_determinized_states": 10000
      }
    }
  }
}

// Fuzzy Query (오타 허용)
GET /products/_search
{
  "query": {
    "fuzzy": {
      "title": {
        "value": "elastcsearch",
        "fuzziness": "AUTO",
        "max_expansions": 50,
        "prefix_length": 0,
        "transpositions": true
      }
    }
  }
}
```

## 🏗️ Compound Queries

### Bool Query 고급 활용

```json
GET /products/_search
{
  "query": {
    "bool": {
      "must": [
        {
          "multi_match": {
            "query": "노트북",
            "fields": ["title.korean^2", "description.korean"]
          }
        }
      ],
      "filter": [
        {
          "range": {
            "price": {
              "gte": 1000000,
              "lte": 3000000
            }
          }
        },
        {
          "terms": {
            "brand.keyword": ["Samsung", "LG", "Apple"]
          }
        },
        {
          "nested": {
            "path": "specifications",
            "query": {
              "bool": {
                "must": [
                  { "match": { "specifications.name": "RAM" }},
                  { "range": { "specifications.value": { "gte": 16 }}}
                ]
              }
            }
          }
        }
      ],
      "should": [
        {
          "match": {
            "features": {
              "query": "SSD NVMe",
              "boost": 2
            }
          }
        },
        {
          "exists": {
            "field": "discount",
            "boost": 1.5
          }
        }
      ],
      "must_not": [
        {
          "term": {
            "status": "out_of_stock"
          }
        }
      ],
      "minimum_should_match": 1
    }
  }
}
```

### Boosting Query

```json
GET /products/_search
{
  "query": {
    "boosting": {
      "positive": {
        "match": {
          "title": "apple macbook"
        }
      },
      "negative": {
        "term": {
          "category": "refurbished"
        }
      },
      "negative_boost": 0.5
    }
  }
}
```

### Function Score Query

```json
GET /products/_search
{
  "query": {
    "function_score": {
      "query": {
        "match": {
          "title": "laptop"
        }
      },
      "functions": [
        {
          "filter": {
            "term": {
              "brand.keyword": "Apple"
            }
          },
          "weight": 2
        },
        {
          "gauss": {
            "price": {
              "origin": 1500000,
              "scale": 500000,
              "decay": 0.5
            }
          }
        },
        {
          "script_score": {
            "script": {
              "source": "_score * doc['popularity'].value / 100"
            }
          }
        },
        {
          "random_score": {
            "seed": 10223,
            "field": "_id"
          },
          "weight": 0.1
        }
      ],
      "score_mode": "sum",  // sum, avg, max, min, multiply
      "boost_mode": "multiply",  // multiply, replace, sum, avg, max, min
      "max_boost": 10,
      "min_score": 5
    }
  }
}
```

## 📊 Aggregations (집계)

### Metric Aggregations

```json
GET /products/_search
{
  "size": 0,
  "aggs": {
    "avg_price": {
      "avg": {
        "field": "price"
      }
    },
    "max_price": {
      "max": {
        "field": "price"
      }
    },
    "min_price": {
      "min": {
        "field": "price"
      }
    },
    "total_price": {
      "sum": {
        "field": "price"
      }
    },
    "product_count": {
      "value_count": {
        "field": "id"
      }
    },
    "unique_brands": {
      "cardinality": {
        "field": "brand.keyword",
        "precision_threshold": 100
      }
    },
    "price_stats": {
      "stats": {
        "field": "price"
      }
    },
    "extended_stats": {
      "extended_stats": {
        "field": "price",
        "sigma": 3
      }
    },
    "price_percentiles": {
      "percentiles": {
        "field": "price",
        "percents": [25, 50, 75, 95, 99]
      }
    },
    "price_percentile_ranks": {
      "percentile_ranks": {
        "field": "price",
        "values": [100000, 500000, 1000000]
      }
    }
  }
}
```

### Bucket Aggregations

```json
GET /products/_search
{
  "size": 0,
  "aggs": {
    // Terms Aggregation
    "by_category": {
      "terms": {
        "field": "category.keyword",
        "size": 10,
        "order": { "_count": "desc" },
        "min_doc_count": 1,
        "missing": "N/A"
      },
      "aggs": {
        "avg_price": {
          "avg": {
            "field": "price"
          }
        },
        "top_products": {
          "top_hits": {
            "size": 3,
            "sort": [{ "popularity": "desc" }],
            "_source": ["title", "price"]
          }
        }
      }
    },
    
    // Range Aggregation
    "price_ranges": {
      "range": {
        "field": "price",
        "ranges": [
          { "key": "cheap", "to": 100000 },
          { "key": "medium", "from": 100000, "to": 1000000 },
          { "key": "expensive", "from": 1000000 }
        ]
      },
      "aggs": {
        "product_count": {
          "value_count": {
            "field": "id"
          }
        }
      }
    },
    
    // Date Histogram
    "sales_over_time": {
      "date_histogram": {
        "field": "created_at",
        "calendar_interval": "1M",  // 1M, 1w, 1d, 1h
        "format": "yyyy-MM-dd",
        "time_zone": "+09:00",
        "min_doc_count": 0,
        "extended_bounds": {
          "min": "2024-01-01",
          "max": "2024-12-31"
        }
      },
      "aggs": {
        "total_sales": {
          "sum": {
            "field": "price"
          }
        },
        "cumulative_sales": {
          "cumulative_sum": {
            "buckets_path": "total_sales"
          }
        }
      }
    },
    
    // Histogram
    "price_distribution": {
      "histogram": {
        "field": "price",
        "interval": 100000,
        "min_doc_count": 0
      }
    },
    
    // Nested Aggregation
    "reviews_analysis": {
      "nested": {
        "path": "reviews"
      },
      "aggs": {
        "avg_rating": {
          "avg": {
            "field": "reviews.rating"
          }
        },
        "rating_distribution": {
          "terms": {
            "field": "reviews.rating"
          }
        }
      }
    },
    
    // Filter Aggregation
    "premium_products": {
      "filter": {
        "range": {
          "price": {
            "gte": 1000000
          }
        }
      },
      "aggs": {
        "avg_price": {
          "avg": {
            "field": "price"
          }
        }
      }
    },
    
    // Filters Aggregation
    "product_segments": {
      "filters": {
        "filters": {
          "budget": { "range": { "price": { "lt": 100000 }}},
          "standard": { "range": { "price": { "gte": 100000, "lt": 1000000 }}},
          "premium": { "range": { "price": { "gte": 1000000 }}}
        }
      },
      "aggs": {
        "avg_price": {
          "avg": {
            "field": "price"
          }
        }
      }
    }
  }
}
```

### Pipeline Aggregations

```json
GET /products/_search
{
  "size": 0,
  "aggs": {
    "sales_per_month": {
      "date_histogram": {
        "field": "created_at",
        "calendar_interval": "1M"
      },
      "aggs": {
        "total_sales": {
          "sum": {
            "field": "price"
          }
        },
        "sales_derivative": {
          "derivative": {
            "buckets_path": "total_sales"
          }
        },
        "moving_average": {
          "moving_avg": {
            "buckets_path": "total_sales",
            "window": 3,
            "model": "simple"  // simple, linear, ewma, holt, holt_winters
          }
        },
        "cumulative_sum": {
          "cumulative_sum": {
            "buckets_path": "total_sales"
          }
        },
        "bucket_selector": {
          "bucket_selector": {
            "buckets_path": {
              "totalSales": "total_sales"
            },
            "script": "params.totalSales > 10000000"
          }
        }
      }
    },
    "max_monthly_sales": {
      "max_bucket": {
        "buckets_path": "sales_per_month>total_sales"
      }
    },
    "min_monthly_sales": {
      "min_bucket": {
        "buckets_path": "sales_per_month>total_sales"
      }
    },
    "avg_monthly_sales": {
      "avg_bucket": {
        "buckets_path": "sales_per_month>total_sales"
      }
    },
    "sum_monthly_sales": {
      "sum_bucket": {
        "buckets_path": "sales_per_month>total_sales"
      }
    },
    "stats_monthly_sales": {
      "stats_bucket": {
        "buckets_path": "sales_per_month>total_sales"
      }
    }
  }
}
```

### Matrix Aggregations

```json
GET /products/_search
{
  "size": 0,
  "aggs": {
    "statistics": {
      "matrix_stats": {
        "fields": ["price", "rating", "view_count"]
      }
    }
  }
}
```

## 🔍 특수 검색 기능

### Highlighting

```json
GET /products/_search
{
  "query": {
    "match": {
      "description": "elasticsearch"
    }
  },
  "highlight": {
    "pre_tags": ["<mark>"],
    "post_tags": ["</mark>"],
    "fields": {
      "description": {
        "fragment_size": 150,
        "number_of_fragments": 3,
        "type": "unified",  // unified, plain, fvh
        "fragmenter": "span",  // simple, span
        "no_match_size": 150
      },
      "title": {}
    },
    "require_field_match": false,
    "boundary_scanner": "sentence",
    "boundary_max_scan": 20
  }
}
```

### Suggesters

```json
GET /products/_search
{
  "suggest": {
    "text": "삼성 갤러시",
    
    // Term Suggester
    "term-suggestion": {
      "term": {
        "field": "title.korean",
        "suggest_mode": "popular",  // missing, popular, always
        "max_edits": 2,
        "prefix_length": 1,
        "min_word_length": 4
      }
    },
    
    // Phrase Suggester
    "phrase-suggestion": {
      "phrase": {
        "field": "title.korean",
        "size": 3,
        "gram_size": 2,
        "confidence": 0.5,
        "max_errors": 2,
        "collate": {
          "query": {
            "source": {
              "match": {
                "{{field_name}}": "{{suggestion}}"
              }
            }
          },
          "params": {
            "field_name": "title"
          },
          "prune": true
        }
      }
    },
    
    // Completion Suggester
    "completion-suggestion": {
      "completion": {
        "field": "suggest",
        "size": 5,
        "skip_duplicates": true,
        "fuzzy": {
          "fuzziness": "AUTO",
          "transpositions": true,
          "min_length": 3,
          "prefix_length": 1
        }
      }
    }
  }
}
```

### Scroll API

```json
// 초기 스크롤 요청
POST /products/_search?scroll=1m
{
  "size": 100,
  "query": {
    "match_all": {}
  }
}

// 다음 배치 요청
POST /_search/scroll
{
  "scroll": "1m",
  "scroll_id": "DXF1ZXJ5QW5kRmV0Y2gBAAAAAAAAAD4WYm9laVYtZndUQlNsdDcwakFMNjU1QQ=="
}

// 스크롤 삭제
DELETE /_search/scroll
{
  "scroll_id": "DXF1ZXJ5QW5kRmV0Y2gBAAAAAAAAAD4WYm9laVYtZndUQlNsdDcwakFMNjU1QQ=="
}
```

### Search After (페이지네이션)

```json
// 첫 페이지
GET /products/_search
{
  "size": 10,
  "query": {
    "match_all": {}
  },
  "sort": [
    { "created_at": "desc" },
    { "_id": "desc" }
  ]
}

// 다음 페이지 (마지막 결과의 sort 값 사용)
GET /products/_search
{
  "size": 10,
  "query": {
    "match_all": {}
  },
  "search_after": ["2024-01-15T10:00:00", "doc123"],
  "sort": [
    { "created_at": "desc" },
    { "_id": "desc" }
  ]
}
```

### Point in Time (PIT)

```json
// PIT 생성
POST /products/_pit?keep_alive=1m

// PIT를 사용한 검색
GET /_search
{
  "size": 100,
  "query": {
    "match_all": {}
  },
  "pit": {
    "id": "46ToAwMDaWR5BXV1aWQyKwZub2RlXzMAAAAAAAAAACoBYwADaWR4BXV1aWQxAgZub2RlXzEAAAAAAAAAAAEBYQADaWR5BXV1aWQyKgZub2RlXzIAAAAAAAAAAAwBYgACBXV1aWQyAA==",
    "keep_alive": "1m"
  },
  "sort": [
    { "_shard_doc": "asc" }
  ]
}

// PIT 삭제
DELETE /_pit
{
  "id": "46ToAwMDaWR5BXV1aWQyKwZub2RlXzMAAAAAAAAAACoBYwADaWR4BXV1aWQxAgZub2RlXzEAAAAAAAAAAAEBYQADaWR5BXV1aWQyKgZub2RlXzIAAAAAAAAAAAwBYgACBXV1aWQyAA=="
}
```

## 🚀 성능 최적화

### 검색 성능 개선

```json
// 1. Filter 활용 (캐시됨)
GET /products/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "title": "laptop" }}
      ],
      "filter": [  // 캐시되는 필터 컨텍스트
        { "term": { "category": "electronics" }},
        { "range": { "price": { "gte": 1000000 }}}
      ]
    }
  }
}

// 2. Source Filtering
GET /products/_search
{
  "_source": ["title", "price"],  // 필요한 필드만
  "query": {
    "match_all": {}
  }
}

// 3. Docvalue Fields (디스크에서 직접 읽기)
GET /products/_search
{
  "query": { "match_all": {} },
  "docvalue_fields": [
    {
      "field": "created_at",
      "format": "epoch_millis"
    }
  ]
}

// 4. Request Cache 활용
GET /products/_search?request_cache=true
{
  "size": 0,
  "aggs": {
    "popular_categories": {
      "terms": {
        "field": "category.keyword"
      }
    }
  }
}

// 5. Profile API로 성능 분석
GET /products/_search
{
  "profile": true,
  "query": {
    "match": {
      "title": "elasticsearch"
    }
  }
}
```

### 집계 성능 개선

```json
// 1. Sampler Aggregation (샘플링)
GET /products/_search
{
  "size": 0,
  "aggs": {
    "sample": {
      "sampler": {
        "shard_size": 200
      },
      "aggs": {
        "keywords": {
          "significant_terms": {
            "field": "tags"
          }
        }
      }
    }
  }
}

// 2. Composite Aggregation (페이지네이션)
GET /products/_search
{
  "size": 0,
  "aggs": {
    "composite_buckets": {
      "composite": {
        "size": 100,
        "sources": [
          { "category": { "terms": { "field": "category.keyword" }}},
          { "brand": { "terms": { "field": "brand.keyword" }}}
        ]
      },
      "aggs": {
        "avg_price": {
          "avg": {
            "field": "price"
          }
        }
      }
    }
  }
}

// 다음 페이지
GET /products/_search
{
  "size": 0,
  "aggs": {
    "composite_buckets": {
      "composite": {
        "size": 100,
        "sources": [
          { "category": { "terms": { "field": "category.keyword" }}},
          { "brand": { "terms": { "field": "brand.keyword" }}}
        ],
        "after": {
          "category": "electronics",
          "brand": "samsung"
        }
      }
    }
  }
}
```

## 🎯 베스트 프랙티스

### 1. 검색 전략
- Query Context는 관련성이 중요할 때
- Filter Context는 Yes/No 조건일 때
- 자주 사용하는 필터는 캐시 활용

### 2. 집계 전략
- 큰 카디널리티는 Composite Aggregation 사용
- 샘플링이 가능하면 Sampler Aggregation 활용
- Pipeline Aggregation은 마지막에 적용

### 3. 페이지네이션
- 작은 데이터: from/size
- 큰 데이터: search_after
- 전체 순회: scroll 또는 PIT

### 4. 성능 모니터링
```bash
# Slow Log 설정
PUT /products/_settings
{
  "index.search.slowlog.threshold.query.warn": "10s",
  "index.search.slowlog.threshold.query.info": "5s",
  "index.search.slowlog.threshold.query.debug": "2s",
  "index.search.slowlog.threshold.query.trace": "500ms",
  "index.search.slowlog.threshold.fetch.warn": "1s",
  "index.search.slowlog.threshold.fetch.info": "800ms"
}
```

---

💡 **다음 단계**: [고급 기능](../04-advanced/README.md)에서 더 깊은 Elasticsearch 기능을 탐구해보세요!