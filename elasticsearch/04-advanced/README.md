# 🚀 Elasticsearch 고급 기능 및 최적화

## 🎯 목표

Elasticsearch의 고급 기능을 활용하고 성능을 최적화하여 상용 서비스 수준의 검색 시스템을 구축합니다.

## 🌐 지리공간 데이터 처리

### Geo-point 데이터 타입

```json
// 인덱스 매핑
PUT /locations
{
  "mappings": {
    "properties": {
      "name": {
        "type": "text"
      },
      "location": {
        "type": "geo_point"  // 위도/경도 저장
      },
      "service_area": {
        "type": "geo_shape",  // 지리적 형태
        "strategy": "recursive"
      }
    }
  }
}

// 데이터 삽입 - 다양한 형식 지원
POST /locations/_doc
{
  "name": "서울타워",
  "location": {
    "lat": 37.5665,
    "lon": 126.9780
  }
}

POST /locations/_doc
{
  "name": "강남역",
  "location": "37.4979,127.0276"  // 문자열 형식
}

POST /locations/_doc
{
  "name": "제주공항",
  "location": [126.4928, 33.5113]  // 배열 형식 [lon, lat]
}

POST /locations/_doc
{
  "name": "부산항",
  "location": "drv3wqq7s"  // Geohash 형식
}
```

### 지리공간 검색 쿼리

```json
// Geo Distance Query - 반경 내 검색
GET /locations/_search
{
  "query": {
    "bool": {
      "must": {
        "match_all": {}
      },
      "filter": {
        "geo_distance": {
          "distance": "10km",
          "location": {
            "lat": 37.5665,
            "lon": 126.9780
          }
        }
      }
    }
  },
  "sort": [
    {
      "_geo_distance": {
        "location": {
          "lat": 37.5665,
          "lon": 126.9780
        },
        "order": "asc",
        "unit": "km",
        "mode": "min",
        "distance_type": "arc"
      }
    }
  ]
}

// Geo Bounding Box Query - 사각형 영역 내 검색
GET /locations/_search
{
  "query": {
    "bool": {
      "filter": {
        "geo_bounding_box": {
          "location": {
            "top_left": {
              "lat": 37.7,
              "lon": 126.8
            },
            "bottom_right": {
              "lat": 37.4,
              "lon": 127.2
            }
          }
        }
      }
    }
  }
}

// Geo Polygon Query - 다각형 영역 내 검색
GET /locations/_search
{
  "query": {
    "bool": {
      "filter": {
        "geo_polygon": {
          "location": {
            "points": [
              {"lat": 37.6, "lon": 126.9},
              {"lat": 37.6, "lon": 127.1},
              {"lat": 37.4, "lon": 127.1},
              {"lat": 37.4, "lon": 126.9}
            ]
          }
        }
      }
    }
  }
}
```

### Geo-shape 데이터 처리

```json
// Geo-shape 데이터 삽입
POST /service-areas/_doc
{
  "name": "서울특별시",
  "area": {
    "type": "polygon",
    "coordinates": [[
      [126.764, 37.700],
      [127.184, 37.700],
      [127.184, 37.430],
      [126.764, 37.430],
      [126.764, 37.700]
    ]]
  }
}

POST /service-areas/_doc
{
  "name": "배달 가능 지역",
  "area": {
    "type": "circle",
    "coordinates": [127.0276, 37.4979],
    "radius": "5km"
  }
}

// Geo-shape 검색
GET /service-areas/_search
{
  "query": {
    "bool": {
      "filter": {
        "geo_shape": {
          "area": {
            "shape": {
              "type": "point",
              "coordinates": [127.0276, 37.4979]
            },
            "relation": "intersects"  // intersects, disjoint, within, contains
          }
        }
      }
    }
  }
}
```

### 지리공간 집계

```json
GET /locations/_search
{
  "size": 0,
  "aggs": {
    // GeoHash Grid Aggregation
    "zoom1": {
      "geohash_grid": {
        "field": "location",
        "precision": 3
      },
      "aggs": {
        "center": {
          "geo_centroid": {
            "field": "location"
          }
        },
        "bounds": {
          "geo_bounds": {
            "field": "location"
          }
        }
      }
    },
    
    // Geo Distance Aggregation
    "distance_ranges": {
      "geo_distance": {
        "field": "location",
        "origin": {
          "lat": 37.5665,
          "lon": 126.9780
        },
        "unit": "km",
        "ranges": [
          {"to": 10},
          {"from": 10, "to": 50},
          {"from": 50}
        ]
      }
    },
    
    // GeoTile Grid Aggregation
    "large_grid": {
      "geotile_grid": {
        "field": "location",
        "precision": 8
      }
    }
  }
}
```

## 🤖 Machine Learning 기능

### Anomaly Detection

```json
// ML Job 생성
PUT _ml/anomaly_detectors/suspicious_login_activity
{
  "description": "비정상적인 로그인 활동 감지",
  "analysis_config": {
    "bucket_span": "15m",
    "detectors": [
      {
        "detector_description": "로그인 횟수 이상",
        "function": "high_count",
        "over_field_name": "user.id"
      },
      {
        "detector_description": "비정상 IP",
        "function": "rare",
        "by_field_name": "source.ip",
        "over_field_name": "user.id"
      },
      {
        "detector_description": "비정상 시간대",
        "function": "time_of_day",
        "over_field_name": "user.id"
      }
    ],
    "influencers": ["user.id", "source.ip", "source.geo.country"]
  },
  "data_description": {
    "time_field": "@timestamp",
    "time_format": "epoch_ms"
  },
  "model_plot_config": {
    "enabled": true,
    "annotations_enabled": true
  },
  "model_snapshot_retention_days": 7,
  "daily_model_snapshot_retention_after_days": 1
}

// Datafeed 설정
PUT _ml/datafeeds/datafeed-suspicious_login_activity
{
  "job_id": "suspicious_login_activity",
  "indices": ["auth-logs-*"],
  "query": {
    "bool": {
      "must": [
        {"term": {"event.action": "login"}}
      ]
    }
  },
  "delayed_data_check_config": {
    "enabled": true
  },
  "scroll_size": 1000,
  "chunking_config": {
    "mode": "auto"
  }
}

// Job 시작
POST _ml/anomaly_detectors/suspicious_login_activity/_open
POST _ml/datafeeds/datafeed-suspicious_login_activity/_start

// 결과 조회
GET _ml/anomaly_detectors/suspicious_login_activity/results/records
{
  "sort": "record_score",
  "desc": true,
  "size": 10
}
```

### Data Frame Analytics

```json
// 회귀 분석
PUT _ml/data_frame/analytics/house_price_prediction
{
  "source": {
    "index": "housing_data",
    "query": {
      "match_all": {}
    }
  },
  "dest": {
    "index": "housing_predictions",
    "results_field": "ml"
  },
  "analyzed_fields": {
    "includes": [
      "size", "bedrooms", "bathrooms", 
      "location", "year_built", "price"
    ]
  },
  "analysis": {
    "regression": {
      "dependent_variable": "price",
      "training_percent": 80,
      "randomize_seed": 42,
      "num_top_feature_importance_values": 5
    }
  },
  "model_memory_limit": "1gb",
  "max_num_threads": 4
}

// 분류 분석
PUT _ml/data_frame/analytics/customer_churn_prediction
{
  "source": {
    "index": "customer_data"
  },
  "dest": {
    "index": "churn_predictions"
  },
  "analysis": {
    "classification": {
      "dependent_variable": "churned",
      "training_percent": 75,
      "num_top_classes": 2,
      "prediction_field_name": "churn_prediction",
      "num_top_feature_importance_values": 10
    }
  }
}

// 클러스터링 분석
PUT _ml/data_frame/analytics/customer_segmentation
{
  "source": {
    "index": "customer_behavior"
  },
  "dest": {
    "index": "customer_segments"
  },
  "analysis": {
    "outlier_detection": {
      "n_neighbors": 20,
      "method": "lof",
      "compute_feature_influence": true,
      "outlier_fraction": 0.05,
      "standardization_enabled": true
    }
  }
}
```

## 🔐 보안 및 권한 관리

### 사용자 인증

```json
// Native User 생성
POST /_security/user/john_doe
{
  "password": "changeme123!",
  "roles": ["data_analyst", "kibana_user"],
  "full_name": "John Doe",
  "email": "john@example.com",
  "metadata": {
    "department": "Analytics",
    "employee_id": "EMP001"
  },
  "enabled": true
}

// API Key 생성
POST /_security/api_key
{
  "name": "my-api-key",
  "expiration": "30d",
  "role_descriptors": {
    "role-a": {
      "cluster": ["all"],
      "index": [
        {
          "names": ["products*"],
          "privileges": ["read", "write"]
        }
      ]
    }
  },
  "metadata": {
    "application": "my-app",
    "environment": "production"
  }
}
```

### Role-Based Access Control (RBAC)

```json
// Custom Role 생성
POST /_security/role/data_analyst
{
  "cluster": ["monitor"],
  "indices": [
    {
      "names": ["sales-*", "products-*"],
      "privileges": ["read", "view_index_metadata"],
      "field_security": {
        "grant": ["*"],
        "except": ["customer.ssn", "customer.credit_card"]
      },
      "query": {
        "bool": {
          "must_not": {
            "term": {
              "department": "executive"
            }
          }
        }
      }
    }
  ],
  "applications": [
    {
      "application": "kibana-.kibana",
      "privileges": ["feature_discover.read"],
      "resources": ["*"]
    }
  ],
  "run_as": [],
  "metadata": {
    "version": 1,
    "created_by": "admin"
  }
}

// Document Level Security
POST /_security/role/regional_manager
{
  "indices": [
    {
      "names": ["sales_data"],
      "privileges": ["read"],
      "query": {
        "template": {
          "source": {
            "bool": {
              "filter": {
                "term": {
                  "region": "{{_user.metadata.region}}"
                }
              }
            }
          }
        }
      }
    }
  ]
}

// Field Level Security
POST /_security/role/limited_access
{
  "indices": [
    {
      "names": ["hr_data"],
      "privileges": ["read"],
      "field_security": {
        "grant": [
          "name",
          "department",
          "position"
        ],
        "except": [
          "salary",
          "ssn",
          "medical_records"
        ]
      }
    }
  ]
}
```

### 감사 로깅

```yaml
# elasticsearch.yml
xpack.security.audit.enabled: true
xpack.security.audit.outputs: [index, logfile]

xpack.security.audit.logfile.events.include:
  - authentication_success
  - authentication_failed
  - access_granted
  - access_denied
  - tampered_request
  - connection_granted
  - connection_denied
  - anonymous_access_denied

xpack.security.audit.logfile.events.exclude:
  - access_granted

xpack.security.audit.logfile.events.emit_request_body: false

# 감사 로그 조회
GET /.security_audit_log*/_search
{
  "query": {
    "bool": {
      "must": [
        {"term": {"event.action": "authentication_failed"}},
        {"range": {"@timestamp": {"gte": "now-1h"}}}
      ]
    }
  },
  "aggs": {
    "by_user": {
      "terms": {
        "field": "user.name"
      }
    }
  }
}
```

## 📡 Cross-Cluster Search & Replication

### Cross-Cluster Search

```yaml
# Remote cluster 설정
PUT /_cluster/settings
{
  "persistent": {
    "cluster": {
      "remote": {
        "cluster_one": {
          "seeds": ["10.0.1.1:9300", "10.0.1.2:9300"],
          "skip_unavailable": true
        },
        "cluster_two": {
          "seeds": ["10.0.2.1:9300"],
          "skip_unavailable": false
        }
      }
    }
  }
}

# Cross-cluster search
GET /cluster_one:products,cluster_two:products,local_products/_search
{
  "query": {
    "match": {
      "title": "elasticsearch"
    }
  },
  "aggs": {
    "by_cluster": {
      "terms": {
        "field": "_index"
      }
    }
  }
}
```

### Cross-Cluster Replication (CCR)

```json
// Leader index 설정
PUT /products/_ccr/follow
{
  "remote_cluster": "cluster_one",
  "leader_index": "products",
  "max_read_request_operation_count": 1024,
  "max_outstanding_read_requests": 16,
  "max_read_request_size": "32mb",
  "max_write_request_operation_count": 1024,
  "max_write_request_size": "16mb",
  "max_outstanding_write_requests": 8,
  "max_write_buffer_count": 512,
  "max_write_buffer_size": "512mb",
  "max_retry_delay": "500ms",
  "read_poll_timeout": "1m"
}

// Auto-follow pattern
PUT /_ccr/auto_follow/logs_pattern
{
  "remote_cluster": "cluster_one",
  "leader_index_patterns": ["logs-*"],
  "follow_index_pattern": "{{leader_index}}-copy",
  "max_read_request_operation_count": 1024,
  "max_outstanding_read_requests": 16
}

// Follower 상태 확인
GET /products/_ccr/stats

// Following 중지
POST /products/_ccr/pause_follow

// Following 재개
POST /products/_ccr/resume_follow

// Unfollow (일반 인덱스로 변환)
POST /products/_ccr/unfollow
```

## 🎭 Transform

### Pivot Transform

```json
// Transform 생성
PUT _transform/ecommerce-customer-transform
{
  "source": {
    "index": ["ecommerce-orders-*"],
    "query": {
      "range": {
        "order_date": {
          "gte": "now-30d"
        }
      }
    }
  },
  "pivot": {
    "group_by": {
      "customer": {
        "terms": {
          "field": "customer_id"
        }
      },
      "month": {
        "date_histogram": {
          "field": "order_date",
          "calendar_interval": "1M"
        }
      }
    },
    "aggregations": {
      "total_spent": {
        "sum": {
          "field": "total_amount"
        }
      },
      "order_count": {
        "value_count": {
          "field": "order_id"
        }
      },
      "avg_order_value": {
        "avg": {
          "field": "total_amount"
        }
      },
      "max_order": {
        "max": {
          "field": "total_amount"
        }
      },
      "unique_products": {
        "cardinality": {
          "field": "product_id"
        }
      },
      "last_order_date": {
        "max": {
          "field": "order_date"
        }
      }
    }
  },
  "description": "Customer purchasing behavior analysis",
  "dest": {
    "index": "customer_analytics"
  },
  "frequency": "1h",
  "sync": {
    "time": {
      "field": "order_date",
      "delay": "60s"
    }
  },
  "retention_policy": {
    "time": {
      "field": "month",
      "max_age": "90d"
    }
  },
  "settings": {
    "max_page_search_size": 500
  }
}

// Transform 시작
POST _transform/ecommerce-customer-transform/_start

// Transform 상태 확인
GET _transform/ecommerce-customer-transform/_stats
```

### Latest Transform

```json
PUT _transform/latest_product_status
{
  "source": {
    "index": "product_updates"
  },
  "latest": {
    "unique_key": ["product_id"],
    "sort": "timestamp"
  },
  "dest": {
    "index": "current_product_status"
  },
  "frequency": "5m",
  "description": "Latest status for each product"
}
```

## 📈 성능 튜닝

### JVM 및 힐 설정

```yaml
# jvm.options
## 힐 크기 (시스템 RAM의 50%, 최대 32GB)
-Xms16g
-Xmx16g

## G1GC 설정
-XX:+UseG1GC
-XX:G1ReservePercent=25
-XX:InitiatingHeapOccupancyPercent=30

## GC 로깅
-XX:+PrintGCDetails
-XX:+PrintGCDateStamps
-XX:+PrintTenuringDistribution
-XX:+PrintGCApplicationStoppedTime
-Xloggc:/var/log/elasticsearch/gc.log
-XX:+UseGCLogFileRotation
-XX:NumberOfGCLogFiles=32
-XX:GCLogFileSize=64m

## 기타 최적화
-XX:+DisableExplicitGC
-XX:+AlwaysPreTouch
-XX:MaxDirectMemorySize=16g
```

### Thread Pool 최적화

```yaml
# elasticsearch.yml
thread_pool:
  search:
    size: 30
    queue_size: 1000
    min_queue_size: 10
    max_queue_size: 2000
    auto_queue_frame_size: 2000
    target_response_time: 1s
  
  write:
    size: 10
    queue_size: 200
  
  get:
    size: 8
    queue_size: 100
  
  analyze:
    size: 4
    queue_size: 50
  
  force_merge:
    size: 1
    queue_size: 5
```

### Circuit Breaker 설정

```yaml
# elasticsearch.yml
indices.breaker.total.use_real_memory: false
indices.breaker.total.limit: 95%

indices.breaker.fielddata.limit: 40%
indices.breaker.fielddata.overhead: 1.03

indices.breaker.request.limit: 60%
indices.breaker.request.overhead: 1

indices.breaker.network.limit: 100%
indices.breaker.network.overhead: 1

indices.breaker.accounting.limit: 100%
indices.breaker.accounting.overhead: 1

indices.breaker.script.limit: 90%
indices.breaker.script.overhead: 1
```

### 인덱싱 성능 최적화

```json
// 대량 인덱싱 전 설정
PUT /my-index/_settings
{
  "index": {
    "refresh_interval": "-1",
    "number_of_replicas": 0,
    "translog.durability": "async",
    "translog.sync_interval": "30s",
    "translog.flush_threshold_size": "1gb"
  }
}

// 인덱싱 후 설정 복구
PUT /my-index/_settings
{
  "index": {
    "refresh_interval": "5s",
    "number_of_replicas": 1
  }
}

// Force merge
POST /my-index/_forcemerge?max_num_segments=1&flush=true
```

### 검색 성능 최적화

```json
// Adaptive Replica Selection 활성화
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.use_adaptive_replica_selection": true
  }
}

// Search Preference
GET /products/_search?preference=_local
{
  "query": {
    "match_all": {}
  }
}

// Request Cache 활성화
PUT /products/_settings
{
  "index.requests.cache.enable": true
}

// Eager Global Ordinals
PUT /products/_mapping
{
  "properties": {
    "category": {
      "type": "keyword",
      "eager_global_ordinals": true
    }
  }
}
```

## 📊 모니터링 및 프로파일링

### Hot Threads API

```bash
# Hot threads 확인
GET /_nodes/hot_threads

# 특정 노드의 hot threads
GET /_nodes/node1/hot_threads?threads=10&interval=500ms&type=cpu
```

### Profile API

```json
GET /products/_search
{
  "profile": true,
  "query": {
    "bool": {
      "must": [
        {"match": {"title": "elasticsearch"}},
        {"range": {"price": {"gte": 10000}}}
      ]
    }
  },
  "aggs": {
    "by_category": {
      "terms": {
        "field": "category"
      }
    }
  }
}
```

### Explain API

```json
GET /products/_explain/1
{
  "query": {
    "match": {
      "title": "elasticsearch"
    }
  }
}
```

### Task Management API

```bash
# 실행 중인 작업 확인
GET /_tasks?detailed=true&actions=*search

# 특정 작업 취소
POST /_tasks/task_id:1/_cancel

# 장기 실행 작업 추적
GET /_tasks?actions=*reindex&wait_for_completion=false
```

## 🎯 베스트 프랙티스

### 1. 클러스터 설계
- 마스터 노드 3개 이상 (홀수)
- 데이터 노드는 CPU/RAM보다 디스크 중심
- Hot-Warm-Cold 아키텍처 고려

### 2. 보안
- TLS/SSL 필수 적용
- 최소 권한 원칙
- 감사 로깅 활성화
- API 키 사용

### 3. 성능
- 적절한 샤드 크기 (20-40GB)
- 캐시 활용 극대화
- 필터 컨텍스트 사용
- 비동기 검색 고려

### 4. 운영
- 정기적인 모니터링
- 자동화된 백업/복구
- 롤링 업그레이드
- 콜드 스탠바이 클러스터

---

💡 **다음 단계**: [실전 패턴](../05-patterns/README.md)에서 실제 사용 사례를 학습해보세요!