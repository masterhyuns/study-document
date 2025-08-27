# 🎯 Elasticsearch 실전 패턴 및 사용 사례

## 🎯 목표

실제 프로덕션 환경에서 자주 사용되는 Elasticsearch 패턴과 솔루션을 학습합니다.

## 🛍️ 1. 이커머스 검색 시스템

### 상품 검색 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                   사용자 인터페이스                    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  검색바 → 자동완성 → 필터 → 정렬 → 페이지네이션        │
│                                                      │
├─────────────────────────────────────────────────────┤
│                   검색 서비스 레이어                   │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Query Builder → Search → Aggregation → Response    │
│                                                      │
├─────────────────────────────────────────────────────┤
│                  Elasticsearch                      │
└─────────────────────────────────────────────────────┘
```

### 상품 인덱스 설계

```json
PUT /products
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "korean_analyzer": {
          "type": "custom",
          "tokenizer": "nori_tokenizer",
          "filter": ["lowercase", "nori_stop", "synonym_filter"]
        },
        "autocomplete": {
          "type": "custom",
          "tokenizer": "edge_ngram_tokenizer",
          "filter": ["lowercase"]
        }
      },
      "tokenizer": {
        "edge_ngram_tokenizer": {
          "type": "edge_ngram",
          "min_gram": 2,
          "max_gram": 10,
          "token_chars": ["letter", "digit"]
        }
      },
      "filter": {
        "synonym_filter": {
          "type": "synonym",
          "synonyms": [
            "노트북, 랩탑, laptop",
            "스마트폰, 휴대폰, 핸드폰",
            "이어폰, 헤드폰, 헤드셋"
          ]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "product_id": {
        "type": "keyword"
      },
      "name": {
        "type": "text",
        "analyzer": "korean_analyzer",
        "fields": {
          "keyword": {
            "type": "keyword"
          },
          "autocomplete": {
            "type": "text",
            "analyzer": "autocomplete"
          }
        }
      },
      "brand": {
        "type": "keyword",
        "fields": {
          "text": {
            "type": "text"
          }
        }
      },
      "category": {
        "type": "keyword"
      },
      "category_hierarchy": {
        "type": "text",
        "analyzer": "keyword",
        "fielddata": true
      },
      "price": {
        "type": "scaled_float",
        "scaling_factor": 100
      },
      "original_price": {
        "type": "scaled_float",
        "scaling_factor": 100
      },
      "discount_percentage": {
        "type": "float"
      },
      "rating": {
        "type": "half_float"
      },
      "review_count": {
        "type": "integer"
      },
      "sales_count": {
        "type": "integer"
      },
      "stock": {
        "type": "integer"
      },
      "is_available": {
        "type": "boolean"
      },
      "attributes": {
        "type": "nested",
        "properties": {
          "name": {"type": "keyword"},
          "value": {"type": "keyword"}
        }
      },
      "tags": {
        "type": "keyword"
      },
      "images": {
        "type": "object",
        "enabled": false
      },
      "created_at": {
        "type": "date"
      },
      "updated_at": {
        "type": "date"
      },
      "boost_score": {
        "type": "float"
      }
    }
  }
}
```

### 상품 검색 구현

```javascript
// Node.js 상품 검색 서비스
const { Client } = require('@elastic/elasticsearch');
const client = new Client({ node: 'http://localhost:9200' });

class ProductSearchService {
  /**
   * 상품 검색 - 검색어, 필터, 정렬 통합
   */
  async searchProducts(params) {
    const {
      query,
      category,
      brand,
      priceMin,
      priceMax,
      inStock,
      sortBy = 'relevance',
      page = 1,
      size = 20
    } = params;

    // 검색 쿼리 구성
    const searchBody = {
      from: (page - 1) * size,
      size: size,
      
      // Query 구성
      query: {
        bool: {
          must: [],
          filter: [],
          should: [],
          minimum_should_match: 0
        }
      },
      
      // 집계
      aggs: {
        categories: {
          terms: {
            field: "category",
            size: 20
          }
        },
        brands: {
          terms: {
            field: "brand",
            size: 20
          }
        },
        price_ranges: {
          range: {
            field: "price",
            ranges: [
              { key: "0-100000", to: 100000 },
              { key: "100000-500000", from: 100000, to: 500000 },
              { key: "500000-1000000", from: 500000, to: 1000000 },
              { key: "1000000+", from: 1000000 }
            ]
          }
        },
        price_stats: {
          stats: {
            field: "price"
          }
        }
      },
      
      // 하이라이트
      highlight: {
        fields: {
          "name": {},
          "description": {}
        },
        pre_tags: ["<mark>"],
        post_tags: ["</mark>"]
      }
    };

    // 검색어 처리
    if (query) {
      searchBody.query.bool.must.push({
        multi_match: {
          query: query,
          fields: ["name^3", "name.autocomplete^2", "brand.text", "tags"],
          type: "best_fields",
          fuzziness: "AUTO"
        }
      });
      
      // 부스팅 추가
      searchBody.query.bool.should.push(
        { match_phrase: { "name": { query: query, boost: 2 } } },
        { term: { "brand.keyword": { value: query, boost: 1.5 } } }
      );
    } else {
      searchBody.query.bool.must.push({ match_all: {} });
    }

    // 필터 추가
    if (category) {
      searchBody.query.bool.filter.push({
        term: { category: category }
      });
    }

    if (brand) {
      searchBody.query.bool.filter.push({
        terms: { brand: Array.isArray(brand) ? brand : [brand] }
      });
    }

    if (priceMin || priceMax) {
      const rangeQuery = { range: { price: {} } };
      if (priceMin) rangeQuery.range.price.gte = priceMin;
      if (priceMax) rangeQuery.range.price.lte = priceMax;
      searchBody.query.bool.filter.push(rangeQuery);
    }

    if (inStock !== undefined) {
      searchBody.query.bool.filter.push({
        term: { is_available: inStock }
      });
    }

    // 정렬 설정
    searchBody.sort = this.getSortCriteria(sortBy);

    // Function Score로 개인화
    if (query) {
      searchBody.query = {
        function_score: {
          query: searchBody.query,
          functions: [
            {
              field_value_factor: {
                field: "sales_count",
                factor: 0.001,
                modifier: "log1p"
              }
            },
            {
              field_value_factor: {
                field: "rating",
                factor: 1.2,
                modifier: "square"
              }
            },
            {
              field_value_factor: {
                field: "boost_score",
                factor: 1.0,
                missing: 1
              }
            }
          ],
          score_mode: "sum",
          boost_mode: "multiply"
        }
      };
    }

    try {
      const response = await client.search({
        index: 'products',
        body: searchBody
      });

      return this.formatSearchResults(response);
    } catch (error) {
      console.error('Search error:', error);
      throw error;
    }
  }

  /**
   * 자동완성
   */
  async autocomplete(prefix) {
    const response = await client.search({
      index: 'products',
      body: {
        size: 10,
        _source: ["name", "brand", "category"],
        query: {
          bool: {
            should: [
              {
                match_phrase_prefix: {
                  "name": {
                    query: prefix,
                    max_expansions: 10
                  }
                }
              },
              {
                prefix: {
                  "name.autocomplete": {
                    value: prefix,
                    boost: 0.5
                  }
                }
              }
            ]
          }
        },
        aggs: {
          suggestions: {
            terms: {
              field: "name.keyword",
              include: `${prefix}.*`,
              size: 5
            }
          }
        }
      }
    });

    return {
      products: response.hits.hits.map(hit => ({
        name: hit._source.name,
        brand: hit._source.brand,
        category: hit._source.category
      })),
      suggestions: response.aggregations.suggestions.buckets.map(b => b.key)
    };
  }

  /**
   * 추천 상품
   */
  async getRecommendations(productId) {
    // 현재 상품 정보 가져오기
    const product = await client.get({
      index: 'products',
      id: productId
    });

    // More Like This 쿼리
    const response = await client.search({
      index: 'products',
      body: {
        size: 10,
        query: {
          more_like_this: {
            fields: ["name", "category", "brand", "tags"],
            like: [
              {
                _index: "products",
                _id: productId
              }
            ],
            min_term_freq: 1,
            min_doc_freq: 2,
            max_query_terms: 12
          }
        }
      }
    });

    return response.hits.hits;
  }

  getSortCriteria(sortBy) {
    const sortOptions = {
      relevance: ["_score"],
      price_asc: [{ price: "asc" }],
      price_desc: [{ price: "desc" }],
      newest: [{ created_at: "desc" }],
      bestseller: [{ sales_count: "desc" }],
      rating: [{ rating: "desc" }, { review_count: "desc" }]
    };

    return sortOptions[sortBy] || sortOptions.relevance;
  }

  formatSearchResults(response) {
    return {
      total: response.hits.total.value,
      products: response.hits.hits.map(hit => ({
        ...hit._source,
        _id: hit._id,
        _score: hit._score,
        highlight: hit.highlight
      })),
      aggregations: {
        categories: response.aggregations.categories.buckets,
        brands: response.aggregations.brands.buckets,
        priceRanges: response.aggregations.price_ranges.buckets,
        priceStats: response.aggregations.price_stats
      }
    };
  }
}

module.exports = ProductSearchService;
```

## 📝 2. 로그 분석 시스템

### 로그 인덱스 설계 (Time Series Data)

```json
PUT _index_template/logs-template
{
  "index_patterns": ["logs-*"],
  "data_stream": {},
  "priority": 200,
  "template": {
    "settings": {
      "number_of_shards": 2,
      "number_of_replicas": 0,
      "index.lifecycle.name": "logs-policy",
      "index.lifecycle.rollover_alias": "logs",
      "index.codec": "best_compression",
      "index.refresh_interval": "5s"
    },
    "mappings": {
      "properties": {
        "@timestamp": {
          "type": "date"
        },
        "level": {
          "type": "keyword"
        },
        "service": {
          "type": "keyword"
        },
        "host": {
          "properties": {
            "name": {"type": "keyword"},
            "ip": {"type": "ip"}
          }
        },
        "message": {
          "type": "text",
          "fields": {
            "keyword": {
              "type": "keyword",
              "ignore_above": 256
            }
          }
        },
        "error": {
          "properties": {
            "code": {"type": "keyword"},
            "message": {"type": "text"},
            "stack_trace": {"type": "text"}
          }
        },
        "http": {
          "properties": {
            "method": {"type": "keyword"},
            "status_code": {"type": "short"},
            "url": {"type": "keyword"},
            "response_time": {"type": "float"}
          }
        },
        "user": {
          "properties": {
            "id": {"type": "keyword"},
            "email": {"type": "keyword"}
          }
        },
        "tags": {
          "type": "keyword"
        }
      }
    }
  }
}
```

### 로그 분석 쿼리

```javascript
class LogAnalyticsService {
  constructor(client) {
    this.client = client;
  }

  /**
   * 에러 로그 분석
   */
  async analyzeErrors(timeRange = '1h') {
    const response = await this.client.search({
      index: 'logs-*',
      body: {
        size: 0,
        query: {
          bool: {
            filter: [
              { term: { level: 'ERROR' }},
              { range: { '@timestamp': { gte: `now-${timeRange}` }}}
            ]
          }
        },
        aggs: {
          errors_over_time: {
            date_histogram: {
              field: '@timestamp',
              calendar_interval: '5m',
              extended_bounds: {
                min: `now-${timeRange}`,
                max: 'now'
              }
            },
            aggs: {
              by_service: {
                terms: {
                  field: 'service',
                  size: 10
                }
              }
            }
          },
          top_errors: {
            terms: {
              field: 'error.code',
              size: 10
            },
            aggs: {
              sample_messages: {
                top_hits: {
                  size: 1,
                  _source: ['error.message', 'service', '@timestamp']
                }
              }
            }
          },
          affected_services: {
            cardinality: {
              field: 'service'
            }
          },
          error_rate: {
            bucket_script: {
              buckets_path: {
                errors: "_count",
                total: "total_requests>_count"
              },
              script: "params.errors / params.total * 100"
            }
          },
          total_requests: {
            filter: {
              match_all: {}
            }
          }
        }
      }
    });

    return response;
  }

  /**
   * API 성능 분석
   */
  async analyzeAPIPerformance(timeRange = '1h') {
    const response = await this.client.search({
      index: 'logs-*',
      body: {
        size: 0,
        query: {
          bool: {
            filter: [
              { exists: { field: 'http.response_time' }},
              { range: { '@timestamp': { gte: `now-${timeRange}` }}}
            ]
          }
        },
        aggs: {
          endpoints: {
            terms: {
              field: 'http.url',
              size: 20
            },
            aggs: {
              response_time_stats: {
                percentiles: {
                  field: 'http.response_time',
                  percents: [50, 75, 95, 99]
                }
              },
              avg_response_time: {
                avg: {
                  field: 'http.response_time'
                }
              },
              status_codes: {
                terms: {
                  field: 'http.status_code'
                }
              },
              slow_requests: {
                bucket_selector: {
                  buckets_path: {
                    avgTime: 'avg_response_time'
                  },
                  script: 'params.avgTime > 1000'
                }
              }
            }
          },
          response_time_trend: {
            date_histogram: {
              field: '@timestamp',
              calendar_interval: '5m'
            },
            aggs: {
              avg_time: {
                avg: {
                  field: 'http.response_time'
                }
              },
              p95_time: {
                percentiles: {
                  field: 'http.response_time',
                  percents: [95]
                }
              }
            }
          }
        }
      }
    });

    return response;
  }

  /**
   * 이상 탐지 - 스파이크 검출
   */
  async detectAnomalies() {
    const response = await this.client.search({
      index: 'logs-*',
      body: {
        size: 0,
        query: {
          range: {
            '@timestamp': {
              gte: 'now-24h'
            }
          }
        },
        aggs: {
          hourly_counts: {
            date_histogram: {
              field: '@timestamp',
              calendar_interval: '1h'
            },
            aggs: {
              error_count: {
                filter: {
                  term: { level: 'ERROR' }
                }
              },
              moving_avg: {
                moving_avg: {
                  buckets_path: 'error_count>_count',
                  window: 3,
                  model: 'simple'
                }
              },
              anomaly_score: {
                bucket_script: {
                  buckets_path: {
                    count: 'error_count>_count',
                    movingAvg: 'moving_avg'
                  },
                  script: """
                    if (params.movingAvg != null && params.movingAvg > 0) {
                      return (params.count - params.movingAvg) / params.movingAvg
                    }
                    return 0
                  """
                }
              }
            }
          }
        }
      }
    });

    // 이상치 판별 (임계값 기준)
    const anomalies = response.aggregations.hourly_counts.buckets
      .filter(bucket => bucket.anomaly_score?.value > 2) // 200% 증가
      .map(bucket => ({
        timestamp: bucket.key_as_string,
        errorCount: bucket.error_count.doc_count,
        anomalyScore: bucket.anomaly_score.value
      }));

    return anomalies;
  }
}
```

## 🔍 3. 실시간 모니터링 대시보드

### 메트릭 수집 및 시각화

```javascript
class MetricsCollector {
  constructor(client) {
    this.client = client;
  }

  /**
   * 시스템 메트릭 수집
   */
  async collectSystemMetrics() {
    const metrics = await this.client.search({
      index: 'metrics-*',
      body: {
        size: 0,
        query: {
          range: {
            '@timestamp': {
              gte: 'now-5m'
            }
          }
        },
        aggs: {
          by_host: {
            terms: {
              field: 'host.name',
              size: 100
            },
            aggs: {
              cpu_usage: {
                avg: {
                  field: 'system.cpu.usage'
                }
              },
              memory_usage: {
                avg: {
                  field: 'system.memory.usage'
                }
              },
              disk_usage: {
                avg: {
                  field: 'system.disk.usage'
                }
              },
              network_in: {
                sum: {
                  field: 'system.network.in.bytes'
                }
              },
              network_out: {
                sum: {
                  field: 'system.network.out.bytes'
                }
              }
            }
          },
          alerts: {
            filters: {
              filters: {
                high_cpu: {
                  range: { 'system.cpu.usage': { gte: 80 }}
                },
                high_memory: {
                  range: { 'system.memory.usage': { gte: 90 }}
                },
                high_disk: {
                  range: { 'system.disk.usage': { gte: 85 }}
                }
              }
            }
          }
        }
      }
    });

    return this.formatMetrics(metrics);
  }

  /**
   * 애플리케이션 메트릭
   */
  async collectApplicationMetrics() {
    const response = await this.client.search({
      index: 'apm-*',
      body: {
        size: 0,
        query: {
          range: {
            '@timestamp': {
              gte: 'now-15m'
            }
          }
        },
        aggs: {
          services: {
            terms: {
              field: 'service.name',
              size: 20
            },
            aggs: {
              transaction_stats: {
                stats: {
                  field: 'transaction.duration'
                }
              },
              error_rate: {
                filters: {
                  filters: {
                    errors: { term: { 'event.outcome': 'failure' }},
                    total: { match_all: {} }
                  }
                },
                aggs: {
                  rate: {
                    bucket_script: {
                      buckets_path: {
                        errors: 'errors>_count',
                        total: 'total>_count'
                      },
                      script: 'params.errors / params.total * 100'
                    }
                  }
                }
              },
              throughput: {
                rate: {
                  field: '@timestamp',
                  unit: 'minute'
                }
              }
            }
          }
        }
      }
    });

    return response;
  }

  formatMetrics(metrics) {
    return {
      hosts: metrics.aggregations.by_host.buckets.map(host => ({
        name: host.key,
        cpu: host.cpu_usage.value,
        memory: host.memory_usage.value,
        disk: host.disk_usage.value,
        network: {
          in: host.network_in.value,
          out: host.network_out.value
        }
      })),
      alerts: {
        highCpu: metrics.aggregations.alerts.buckets.high_cpu.doc_count,
        highMemory: metrics.aggregations.alerts.buckets.high_memory.doc_count,
        highDisk: metrics.aggregations.alerts.buckets.high_disk.doc_count
      }
    };
  }
}
```

## 📊 4. 사용자 행동 분석

### 세션 분석 및 퍼널 추적

```javascript
class UserAnalyticsService {
  /**
   * 사용자 세션 분석
   */
  async analyzeUserSessions(userId, days = 7) {
    const response = await this.client.search({
      index: 'user-events-*',
      body: {
        size: 0,
        query: {
          bool: {
            filter: [
              { term: { 'user.id': userId }},
              { range: { '@timestamp': { gte: `now-${days}d` }}}
            ]
          }
        },
        aggs: {
          sessions: {
            composite: {
              size: 100,
              sources: [
                { session: { terms: { field: 'session.id' }}}
              ]
            },
            aggs: {
              session_duration: {
                bucket_script: {
                  buckets_path: {
                    min: 'min_time',
                    max: 'max_time'
                  },
                  script: 'params.max - params.min'
                }
              },
              min_time: {
                min: { field: '@timestamp' }
              },
              max_time: {
                max: { field: '@timestamp' }
              },
              events: {
                terms: {
                  field: 'event.type',
                  size: 50
                }
              },
              pages_viewed: {
                cardinality: {
                  field: 'page.url'
                }
              }
            }
          }
        }
      }
    });

    return response;
  }

  /**
   * 전환 퍼널 분석
   */
  async analyzeFunnel(steps, timeRange = '7d') {
    // 퍼널 단계별 쿼리 구성
    const funnelQuery = {
      size: 0,
      query: {
        range: {
          '@timestamp': {
            gte: `now-${timeRange}`
          }
        }
      },
      aggs: {}
    };

    // 각 단계별 집계 추가
    steps.forEach((step, index) => {
      funnelQuery.aggs[`step_${index}`] = {
        filter: {
          term: { 'event.action': step }
        },
        aggs: {
          unique_users: {
            cardinality: {
              field: 'user.id'
            }
          }
        }
      };

      // 이전 단계와의 전환율 계산
      if (index > 0) {
        funnelQuery.aggs[`conversion_${index}`] = {
          bucket_script: {
            buckets_path: {
              current: `step_${index}>unique_users`,
              previous: `step_${index - 1}>unique_users`
            },
            script: 'params.current / params.previous * 100'
          }
        };
      }
    });

    const response = await this.client.search({
      index: 'user-events-*',
      body: funnelQuery
    });

    // 결과 포맷팅
    return steps.map((step, index) => ({
      step: step,
      users: response.aggregations[`step_${index}`].unique_users.value,
      conversionRate: index > 0 
        ? response.aggregations[`conversion_${index}`].value 
        : 100
    }));
  }
}
```

## 🏢 5. 멀티테넌트 아키텍처

### 테넌트별 인덱스 격리

```javascript
class MultiTenantService {
  /**
   * 테넌트별 인덱스 생성
   */
  async createTenantIndex(tenantId) {
    const indexName = `tenant_${tenantId}_data`;
    
    await this.client.indices.create({
      index: indexName,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
          'index.routing.allocation.include.tenant': tenantId,
          'index.blocks.read_only_allow_delete': false
        },
        mappings: {
          properties: {
            tenant_id: {
              type: 'keyword'
            },
            document_type: {
              type: 'keyword'
            },
            data: {
              type: 'object',
              enabled: true
            },
            created_by: {
              type: 'keyword'
            },
            created_at: {
              type: 'date'
            },
            updated_at: {
              type: 'date'
            },
            access_control: {
              properties: {
                owner: { type: 'keyword' },
                shared_with: { type: 'keyword' },
                permissions: { type: 'keyword' }
              }
            }
          }
        },
        aliases: {
          [`tenant_${tenantId}`]: {}
        }
      }
    });

    // 테넌트별 ILM 정책 적용
    await this.applyTenantILMPolicy(tenantId, indexName);
  }

  /**
   * 크로스 테넌트 검색 (관리자용)
   */
  async crossTenantSearch(query, tenantIds) {
    const indices = tenantIds.map(id => `tenant_${id}_data`).join(',');
    
    const response = await this.client.search({
      index: indices,
      body: {
        query: {
          bool: {
            must: [
              query,
              {
                terms: {
                  tenant_id: tenantIds
                }
              }
            ]
          }
        },
        aggs: {
          by_tenant: {
            terms: {
              field: 'tenant_id'
            },
            aggs: {
              document_types: {
                terms: {
                  field: 'document_type'
                }
              },
              storage_size: {
                sum: {
                  script: {
                    source: "_source.toString().length()"
                  }
                }
              }
            }
          }
        }
      }
    });

    return response;
  }

  /**
   * 테넌트별 사용량 모니터링
   */
  async monitorTenantUsage(tenantId) {
    const indexName = `tenant_${tenantId}_data`;
    
    const stats = await this.client.indices.stats({
      index: indexName,
      metric: ['docs', 'store', 'indexing', 'search']
    });

    const usage = await this.client.search({
      index: indexName,
      body: {
        size: 0,
        aggs: {
          storage_by_type: {
            terms: {
              field: 'document_type'
            },
            aggs: {
              size_bytes: {
                sum: {
                  script: {
                    source: "_source.toString().length()"
                  }
                }
              }
            }
          },
          daily_activity: {
            date_histogram: {
              field: 'created_at',
              calendar_interval: '1d',
              extended_bounds: {
                min: 'now-30d',
                max: 'now'
              }
            }
          }
        }
      }
    });

    return {
      tenantId,
      stats: stats.indices[indexName],
      usage: usage.aggregations
    };
  }
}
```

## 🎯 베스트 프랙티스

### 1. 인덱스 설계 원칙
- **Time-based data**: 날짜별 인덱스 + ILM
- **High cardinality**: 샤드 키 최적화
- **Multi-tenant**: 테넌트별 인덱스 격리
- **Search-heavy**: 복제본 증가, 캐싱 활용

### 2. 쿼리 최적화
- **Filter context** 적극 활용
- **Aggregation** 캐싱 활용
- **Scroll/Search After** 대량 데이터 처리
- **Profile API**로 쿼리 성능 분석

### 3. 운영 고려사항
- **Monitoring**: 클러스터 헬스, 노드 상태
- **Alerting**: 임계값 기반 알림
- **Backup**: 스냅샷 정기 백업
- **Security**: RBAC, API 키 관리

### 4. 확장성
- **Horizontal scaling**: 노드 추가
- **Index sharding**: 적절한 샤드 수
- **Read replicas**: 읽기 성능 향상
- **Cross-cluster search**: 멀티 클러스터

---

💡 **다음 단계**: [실습 프로젝트](../07-exercises/README.md)에서 실제 구현을 연습해보세요!