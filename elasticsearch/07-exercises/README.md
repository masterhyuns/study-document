# 🏋️ Elasticsearch 실습 프로젝트

## 🎯 목표

실제 프로젝트를 통해 Elasticsearch의 핵심 기능을 실습하고 마스터합니다.

## 📚 Project 1: 도서 검색 시스템

### 목표
온라인 서점을 위한 고급 검색 시스템 구축

### 요구사항
- 한글/영문 도서 검색
- 자동완성 기능
- 카테고리별 필터링
- 저자/출판사 검색
- 가격 범위 필터
- 베스트셀러 정렬
- 연관 도서 추천

### 단계별 구현

#### Step 1: 인덱스 설계 및 생성

```json
PUT /books
{
  "settings": {
    "number_of_shards": 2,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "korean_analyzer": {
          "type": "custom",
          "tokenizer": "nori_tokenizer",
          "filter": ["lowercase", "nori_stop", "synonym_filter"]
        },
        "edge_ngram_analyzer": {
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
            "프로그래밍, 코딩, 개발",
            "인공지능, AI, 머신러닝, ML",
            "데이터베이스, DB, 디비"
          ]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "isbn": {
        "type": "keyword"
      },
      "title": {
        "type": "text",
        "analyzer": "korean_analyzer",
        "fields": {
          "keyword": {
            "type": "keyword"
          },
          "suggest": {
            "type": "text",
            "analyzer": "edge_ngram_analyzer"
          }
        }
      },
      "author": {
        "type": "text",
        "fields": {
          "keyword": {
            "type": "keyword"
          }
        }
      },
      "publisher": {
        "type": "keyword"
      },
      "category": {
        "type": "keyword"
      },
      "subcategory": {
        "type": "keyword"
      },
      "description": {
        "type": "text",
        "analyzer": "korean_analyzer"
      },
      "price": {
        "type": "integer"
      },
      "discount_rate": {
        "type": "float"
      },
      "publication_date": {
        "type": "date"
      },
      "pages": {
        "type": "integer"
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
      "tags": {
        "type": "keyword"
      },
      "in_stock": {
        "type": "boolean"
      }
    }
  }
}
```

#### Step 2: 샘플 데이터 입력

```javascript
// bulk-insert-books.js
const { Client } = require('@elastic/elasticsearch');
const client = new Client({ node: 'http://localhost:9200' });

async function insertSampleBooks() {
  const books = [
    {
      isbn: "978-89-6848-123-4",
      title: "엘라스틱서치 완벽 가이드",
      author: "김철수",
      publisher: "한빛미디어",
      category: "IT",
      subcategory: "데이터베이스",
      description: "엘라스틱서치의 모든 것을 다루는 완벽한 가이드북",
      price: 45000,
      discount_rate: 0.1,
      publication_date: "2024-01-15",
      pages: 650,
      rating: 4.5,
      review_count: 234,
      sales_count: 1523,
      tags: ["elasticsearch", "검색엔진", "빅데이터"],
      in_stock: true
    },
    {
      isbn: "978-89-6848-124-1",
      title: "실전 카프카 개발부터 운영까지",
      author: "이영희",
      publisher: "위키북스",
      category: "IT",
      subcategory: "빅데이터",
      description: "아파치 카프카를 활용한 데이터 파이프라인 구축",
      price: 38000,
      discount_rate: 0.15,
      publication_date: "2023-11-20",
      pages: 520,
      rating: 4.7,
      review_count: 189,
      sales_count: 892,
      tags: ["kafka", "스트리밍", "메시징"],
      in_stock: true
    },
    {
      isbn: "978-89-6848-125-8",
      title: "Node.js 마이크로서비스 개발",
      author: "박지성",
      publisher: "제이펍",
      category: "IT",
      subcategory: "웹개발",
      description: "Node.js를 활용한 확장 가능한 마이크로서비스 아키텍처",
      price: 32000,
      discount_rate: 0.2,
      publication_date: "2023-09-10",
      pages: 420,
      rating: 4.3,
      review_count: 156,
      sales_count: 673,
      tags: ["nodejs", "마이크로서비스", "백엔드"],
      in_stock: true
    }
  ];

  const operations = books.flatMap(doc => [
    { index: { _index: 'books' }},
    doc
  ]);

  const bulkResponse = await client.bulk({ refresh: true, operations });

  if (bulkResponse.errors) {
    console.error('Bulk insert errors:', bulkResponse.items);
  } else {
    console.log('Successfully inserted', books.length, 'books');
  }
}

insertSampleBooks().catch(console.error);
```

#### Step 3: 검색 구현

```javascript
// book-search-service.js
class BookSearchService {
  constructor(client) {
    this.client = client;
  }

  /**
   * 도서 검색
   */
  async searchBooks({
    query,
    category,
    author,
    publisher,
    priceMin,
    priceMax,
    sortBy = 'relevance',
    page = 1,
    size = 20
  }) {
    const searchBody = {
      from: (page - 1) * size,
      size: size,
      query: {
        bool: {
          must: [],
          filter: [],
          should: []
        }
      },
      aggs: {
        categories: {
          terms: { field: "category", size: 10 }
        },
        publishers: {
          terms: { field: "publisher", size: 10 }
        },
        price_ranges: {
          range: {
            field: "price",
            ranges: [
              { key: "~20000", to: 20000 },
              { key: "20000~40000", from: 20000, to: 40000 },
              { key: "40000~", from: 40000 }
            ]
          }
        },
        avg_rating: {
          avg: { field: "rating" }
        }
      },
      highlight: {
        fields: {
          title: {},
          description: { fragment_size: 150 }
        }
      }
    };

    // 검색어 처리
    if (query) {
      searchBody.query.bool.must.push({
        multi_match: {
          query: query,
          fields: ["title^3", "author^2", "description", "tags"],
          type: "best_fields",
          fuzziness: "AUTO"
        }
      });
    }

    // 필터 적용
    if (category) {
      searchBody.query.bool.filter.push({ term: { category } });
    }
    if (author) {
      searchBody.query.bool.filter.push({ match: { author } });
    }
    if (publisher) {
      searchBody.query.bool.filter.push({ term: { publisher } });
    }
    if (priceMin || priceMax) {
      const range = { range: { price: {} }};
      if (priceMin) range.range.price.gte = priceMin;
      if (priceMax) range.range.price.lte = priceMax;
      searchBody.query.bool.filter.push(range);
    }

    // 정렬
    searchBody.sort = this.getSortCriteria(sortBy);

    const response = await this.client.search({
      index: 'books',
      body: searchBody
    });

    return this.formatResults(response);
  }

  /**
   * 자동완성
   */
  async autocomplete(prefix) {
    const response = await this.client.search({
      index: 'books',
      body: {
        size: 5,
        _source: ["title", "author"],
        query: {
          match: {
            "title.suggest": {
              query: prefix,
              fuzziness: "AUTO"
            }
          }
        }
      }
    });

    return response.hits.hits.map(hit => ({
      title: hit._source.title,
      author: hit._source.author
    }));
  }

  /**
   * 추천 도서
   */
  async getRecommendations(bookId) {
    const book = await this.client.get({
      index: 'books',
      id: bookId
    });

    const response = await this.client.search({
      index: 'books',
      body: {
        size: 6,
        query: {
          more_like_this: {
            fields: ["title", "description", "tags", "category"],
            like: [{
              _index: "books",
              _id: bookId
            }],
            min_term_freq: 1,
            min_doc_freq: 1
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
      newest: [{ publication_date: "desc" }],
      bestseller: [{ sales_count: "desc" }],
      rating: [{ rating: "desc" }]
    };
    return sortOptions[sortBy] || sortOptions.relevance;
  }

  formatResults(response) {
    return {
      total: response.hits.total.value,
      books: response.hits.hits.map(hit => ({
        id: hit._id,
        ...hit._source,
        _score: hit._score,
        highlight: hit.highlight
      })),
      facets: {
        categories: response.aggregations.categories.buckets,
        publishers: response.aggregations.publishers.buckets,
        priceRanges: response.aggregations.price_ranges.buckets,
        avgRating: response.aggregations.avg_rating.value
      }
    };
  }
}

// 테스트
async function testBookSearch() {
  const client = new Client({ node: 'http://localhost:9200' });
  const searchService = new BookSearchService(client);

  // 일반 검색
  const results = await searchService.searchBooks({
    query: "엘라스틱서치",
    category: "IT",
    priceMax: 50000,
    sortBy: "rating"
  });

  console.log('Search Results:', JSON.stringify(results, null, 2));

  // 자동완성
  const suggestions = await searchService.autocomplete("엘라");
  console.log('Autocomplete:', suggestions);

  // 추천
  const recommendations = await searchService.getRecommendations("book_id_here");
  console.log('Recommendations:', recommendations);
}

module.exports = BookSearchService;
```

## 🚨 Project 2: 실시간 알림 시스템

### 목표
이벤트 기반 실시간 알림 시스템 구축

### 요구사항
- 다양한 이벤트 타입 지원
- 사용자별 알림 구독
- 읽음/안읽음 관리
- 우선순위 기반 정렬
- 알림 집계 및 그룹핑

### 구현

```javascript
// notification-system.js
class NotificationSystem {
  constructor(client) {
    this.client = client;
  }

  /**
   * 알림 인덱스 생성
   */
  async createNotificationIndex() {
    await this.client.indices.create({
      index: 'notifications',
      body: {
        settings: {
          number_of_shards: 2,
          number_of_replicas: 1
        },
        mappings: {
          properties: {
            user_id: { type: 'keyword' },
            type: { type: 'keyword' },
            title: { type: 'text' },
            message: { type: 'text' },
            priority: { type: 'keyword' }, // high, medium, low
            status: { type: 'keyword' }, // unread, read, archived
            created_at: { type: 'date' },
            read_at: { type: 'date' },
            expires_at: { type: 'date' },
            metadata: {
              type: 'object',
              enabled: false
            },
            related_entity: {
              properties: {
                type: { type: 'keyword' },
                id: { type: 'keyword' }
              }
            }
          }
        }
      }
    });
  }

  /**
   * 알림 생성
   */
  async createNotification(notification) {
    const doc = {
      ...notification,
      status: 'unread',
      created_at: new Date().toISOString()
    };

    const response = await this.client.index({
      index: 'notifications',
      body: doc,
      refresh: 'wait_for'
    });

    // 실시간 알림 전송 (WebSocket 등)
    await this.sendRealtimeNotification(notification.user_id, doc);

    return response;
  }

  /**
   * 사용자 알림 조회
   */
  async getUserNotifications(userId, options = {}) {
    const {
      status = null,
      type = null,
      priority = null,
      from = 0,
      size = 20,
      includeExpired = false
    } = options;

    const must = [{ term: { user_id: userId }}];
    const filter = [];

    if (!includeExpired) {
      filter.push({
        bool: {
          should: [
            { bool: { must_not: { exists: { field: 'expires_at' }}}},
            { range: { expires_at: { gte: 'now' }}}
          ]
        }
      });
    }

    if (status) filter.push({ term: { status }});
    if (type) filter.push({ term: { type }});
    if (priority) filter.push({ term: { priority }});

    const response = await this.client.search({
      index: 'notifications',
      body: {
        from,
        size,
        query: {
          bool: { must, filter }
        },
        sort: [
          { priority: { order: 'desc', unmapped_type: 'keyword' }},
          { created_at: { order: 'desc' }}
        ],
        aggs: {
          unread_count: {
            filter: { term: { status: 'unread' }}
          },
          by_type: {
            terms: { field: 'type' }
          },
          by_priority: {
            terms: { field: 'priority' }
          }
        }
      }
    });

    return {
      notifications: response.hits.hits.map(hit => ({
        id: hit._id,
        ...hit._source
      })),
      total: response.hits.total.value,
      stats: {
        unreadCount: response.aggregations.unread_count.doc_count,
        byType: response.aggregations.by_type.buckets,
        byPriority: response.aggregations.by_priority.buckets
      }
    };
  }

  /**
   * 알림 읽음 처리
   */
  async markAsRead(notificationIds) {
    const operations = notificationIds.flatMap(id => [
      {
        update: {
          _index: 'notifications',
          _id: id
        }
      },
      {
        doc: {
          status: 'read',
          read_at: new Date().toISOString()
        }
      }
    ]);

    return await this.client.bulk({ operations, refresh: true });
  }

  /**
   * 알림 그룹핑 및 요약
   */
  async getNotificationSummary(userId, days = 7) {
    const response = await this.client.search({
      index: 'notifications',
      body: {
        size: 0,
        query: {
          bool: {
            filter: [
              { term: { user_id: userId }},
              { range: { created_at: { gte: `now-${days}d` }}}
            ]
          }
        },
        aggs: {
          timeline: {
            date_histogram: {
              field: 'created_at',
              calendar_interval: '1d'
            },
            aggs: {
              by_type: {
                terms: { field: 'type' }
              }
            }
          },
          important_unread: {
            filter: {
              bool: {
                must: [
                  { term: { status: 'unread' }},
                  { term: { priority: 'high' }}
                ]
              }
            },
            aggs: {
              recent: {
                top_hits: {
                  size: 5,
                  sort: [{ created_at: 'desc' }],
                  _source: ['title', 'message', 'type']
                }
              }
            }
          }
        }
      }
    });

    return response.aggregations;
  }

  /**
   * 알림 정리 (오래된 알림 삭제)
   */
  async cleanupOldNotifications(days = 30) {
    const response = await this.client.deleteByQuery({
      index: 'notifications',
      body: {
        query: {
          bool: {
            should: [
              {
                range: {
                  created_at: {
                    lte: `now-${days}d`
                  }
                }
              },
              {
                range: {
                  expires_at: {
                    lte: 'now'
                  }
                }
              }
            ]
          }
        }
      }
    });

    return response;
  }

  async sendRealtimeNotification(userId, notification) {
    // WebSocket 또는 SSE를 통한 실시간 전송
    console.log(`Sending realtime notification to user ${userId}:`, notification);
  }
}
```

## 📊 Project 3: 실시간 대시보드

### 목표
비즈니스 메트릭을 실시간으로 모니터링하는 대시보드

### 구현

```javascript
// realtime-dashboard.js
class RealtimeDashboard {
  constructor(client) {
    this.client = client;
  }

  /**
   * 실시간 매출 현황
   */
  async getSalesMetrics(timeRange = '24h') {
    const response = await this.client.search({
      index: 'orders-*',
      body: {
        size: 0,
        query: {
          range: {
            order_date: { gte: `now-${timeRange}` }
          }
        },
        aggs: {
          total_revenue: {
            sum: { field: 'total_amount' }
          },
          total_orders: {
            value_count: { field: 'order_id' }
          },
          avg_order_value: {
            avg: { field: 'total_amount' }
          },
          revenue_timeline: {
            date_histogram: {
              field: 'order_date',
              calendar_interval: '1h',
              extended_bounds: {
                min: `now-${timeRange}`,
                max: 'now'
              }
            },
            aggs: {
              revenue: {
                sum: { field: 'total_amount' }
              },
              orders: {
                value_count: { field: 'order_id' }
              }
            }
          },
          top_products: {
            terms: {
              field: 'product_name.keyword',
              size: 10,
              order: { revenue: 'desc' }
            },
            aggs: {
              revenue: {
                sum: { field: 'total_amount' }
              },
              quantity: {
                sum: { field: 'quantity' }
              }
            }
          },
          payment_methods: {
            terms: {
              field: 'payment_method',
              size: 5
            }
          },
          conversion_funnel: {
            filters: {
              filters: {
                viewed: { exists: { field: 'view_date' }},
                added_to_cart: { exists: { field: 'cart_date' }},
                ordered: { exists: { field: 'order_date' }}
              }
            }
          }
        }
      }
    });

    // 전일 대비 비교
    const yesterdayResponse = await this.client.search({
      index: 'orders-*',
      body: {
        size: 0,
        query: {
          range: {
            order_date: {
              gte: 'now-48h/d',
              lt: 'now-24h/d'
            }
          }
        },
        aggs: {
          total_revenue: {
            sum: { field: 'total_amount' }
          }
        }
      }
    });

    const currentRevenue = response.aggregations.total_revenue.value;
    const yesterdayRevenue = yesterdayResponse.aggregations.total_revenue.value;
    const revenueGrowth = ((currentRevenue - yesterdayRevenue) / yesterdayRevenue) * 100;

    return {
      summary: {
        totalRevenue: currentRevenue,
        totalOrders: response.aggregations.total_orders.value,
        avgOrderValue: response.aggregations.avg_order_value.value,
        revenueGrowth: revenueGrowth.toFixed(2)
      },
      timeline: response.aggregations.revenue_timeline.buckets,
      topProducts: response.aggregations.top_products.buckets,
      paymentMethods: response.aggregations.payment_methods.buckets,
      conversionFunnel: response.aggregations.conversion_funnel.buckets
    };
  }

  /**
   * 실시간 사용자 활동
   */
  async getUserActivityMetrics() {
    const response = await this.client.search({
      index: 'user-events-*',
      body: {
        size: 0,
        query: {
          range: {
            '@timestamp': { gte: 'now-15m' }
          }
        },
        aggs: {
          active_users: {
            cardinality: { field: 'user.id' }
          },
          events_per_minute: {
            date_histogram: {
              field: '@timestamp',
              calendar_interval: '1m'
            },
            aggs: {
              unique_users: {
                cardinality: { field: 'user.id' }
              },
              by_event_type: {
                terms: { field: 'event.type' }
              }
            }
          },
          popular_pages: {
            terms: {
              field: 'page.url',
              size: 10
            }
          },
          user_locations: {
            terms: {
              field: 'geo.country',
              size: 10
            }
          },
          device_types: {
            terms: {
              field: 'device.type'
            }
          }
        }
      }
    });

    return response.aggregations;
  }

  /**
   * 실시간 시스템 상태
   */
  async getSystemHealth() {
    // 클러스터 상태
    const clusterHealth = await this.client.cluster.health();
    
    // 노드 통계
    const nodeStats = await this.client.nodes.stats();
    
    // 인덱스 통계
    const indexStats = await this.client.indices.stats();

    // 최근 에러 로그
    const errorLogs = await this.client.search({
      index: 'logs-*',
      body: {
        size: 10,
        query: {
          bool: {
            filter: [
              { term: { level: 'ERROR' }},
              { range: { '@timestamp': { gte: 'now-1h' }}}
            ]
          }
        },
        sort: [{ '@timestamp': 'desc' }]
      }
    });

    return {
      cluster: {
        status: clusterHealth.status,
        nodeCount: clusterHealth.number_of_nodes,
        shards: {
          active: clusterHealth.active_shards,
          relocating: clusterHealth.relocating_shards,
          unassigned: clusterHealth.unassigned_shards
        }
      },
      nodes: Object.values(nodeStats.nodes).map(node => ({
        name: node.name,
        cpu: node.os?.cpu?.percent,
        memory: node.jvm?.mem?.heap_used_percent,
        disk: node.fs?.total?.available_in_bytes
      })),
      indices: {
        count: indexStats._all.total.indexing.index_total,
        size: indexStats._all.total.store.size_in_bytes,
        docs: indexStats._all.total.docs.count
      },
      recentErrors: errorLogs.hits.hits
    };
  }

  /**
   * WebSocket을 통한 실시간 업데이트
   */
  async streamMetrics(ws) {
    const interval = setInterval(async () => {
      try {
        const metrics = await this.getSalesMetrics('1h');
        const activity = await this.getUserActivityMetrics();
        const health = await this.getSystemHealth();

        ws.send(JSON.stringify({
          type: 'metrics_update',
          timestamp: new Date().toISOString(),
          data: { metrics, activity, health }
        }));
      } catch (error) {
        console.error('Error streaming metrics:', error);
      }
    }, 5000); // 5초마다 업데이트

    ws.on('close', () => clearInterval(interval));
  }
}

module.exports = RealtimeDashboard;
```

## 🎯 실습 과제

### 과제 1: 뉴스 검색 엔진
1. 뉴스 기사 인덱스 설계
2. 키워드 기반 검색
3. 날짜별 필터링
4. 카테고리 분류
5. 관련 기사 추천

### 과제 2: 로그 분석 시스템
1. 로그 데이터 수집
2. 에러 패턴 분석
3. 성능 메트릭 추출
4. 알림 규칙 설정
5. 대시보드 구성

### 과제 3: 소셜 미디어 분석
1. 사용자 활동 추적
2. 트렌딩 토픽 분석
3. 인플루언서 식별
4. 감성 분석
5. 네트워크 분석

## 📝 평가 체크리스트

### 기능 구현
- [ ] 인덱스 설계 적절성
- [ ] 검색 쿼리 최적화
- [ ] 집계 기능 활용
- [ ] 성능 최적화
- [ ] 에러 처리

### 코드 품질
- [ ] 구조화된 코드
- [ ] 재사용 가능한 컴포넌트
- [ ] 적절한 주석
- [ ] 테스트 코드
- [ ] 문서화

### 운영 고려사항
- [ ] 확장성
- [ ] 모니터링
- [ ] 백업 전략
- [ ] 보안 설정
- [ ] 성능 튜닝

---

🎉 **축하합니다!** Elasticsearch 학습을 완료했습니다. 이제 실제 프로젝트에 적용해보세요!