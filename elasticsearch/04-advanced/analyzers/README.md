# 🔍 Elasticsearch Analyzer 완벽 가이드

## 🎯 목표

Elasticsearch의 텍스트 분석 파이프라인을 완벽히 이해하고 커스텀 분석기를 구축합니다.

## 📚 Analyzer 구성 요소

### 분석 프로세스 흐름

```
┌─────────────────────────────────────────────────────┐
│                    원본 텍스트                        │
│            "The Quick BROWN foxes jumped!"           │
└────────────────────┬─────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│              1. Character Filter                     │
│        HTML 태그 제거, 특수문자 변환 등               │
└────────────────────┬─────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│                 2. Tokenizer                         │
│            텍스트를 토큰으로 분리                      │
│     ["The", "Quick", "BROWN", "foxes", "jumped"]    │
└────────────────────┬─────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│               3. Token Filter                        │
│     소문자 변환, 불용어 제거, 형태소 변환 등           │
│         ["quick", "brown", "fox", "jump"]           │
└─────────────────────────────────────────────────────┘
```

## 🛠️ Built-in Analyzers

### Standard Analyzer

```json
// 테스트
POST _analyze
{
  "analyzer": "standard",
  "text": "The 2 Quick-Brown foxes jumped over the lazy dog's bone."
}

// 커스터마이징
PUT my-index
{
  "settings": {
    "analysis": {
      "analyzer": {
        "my_standard": {
          "type": "standard",
          "max_token_length": 5,
          "stopwords": "_english_"
        }
      }
    }
  }
}
```

### Language Analyzers

```json
// 영어 Analyzer
PUT english-index
{
  "settings": {
    "analysis": {
      "analyzer": {
        "english_custom": {
          "type": "english",
          "stopwords": ["the", "and", "or", "but"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "content": {
        "type": "text",
        "analyzer": "english_custom"
      }
    }
  }
}

// 다국어 지원
PUT multilingual-index
{
  "mappings": {
    "properties": {
      "title": {
        "type": "text",
        "fields": {
          "en": {
            "type": "text",
            "analyzer": "english"
          },
          "ko": {
            "type": "text",
            "analyzer": "nori"
          },
          "ja": {
            "type": "text",
            "analyzer": "kuromoji"
          },
          "zh": {
            "type": "text",
            "analyzer": "smartcn"
          }
        }
      }
    }
  }
}
```

## 🎯 Custom Analyzer 구축

### Character Filters

```json
PUT custom-analyzer-index
{
  "settings": {
    "analysis": {
      "char_filter": {
        // HTML Strip
        "html_cleaner": {
          "type": "html_strip",
          "escaped_tags": ["b", "i"]
        },
        
        // Mapping
        "emoji_mapper": {
          "type": "mapping",
          "mappings": [
            "😊 => happy",
            "😢 => sad",
            "❤️ => love",
            "👍 => good"
          ]
        },
        
        // Pattern Replace
        "phone_normalizer": {
          "type": "pattern_replace",
          "pattern": "(\\d{3})-(\\d{4})-(\\d{4})",
          "replacement": "$1$2$3"
        }
      }
    }
  }
}
```

### Tokenizers

```json
PUT tokenizer-examples
{
  "settings": {
    "analysis": {
      "tokenizer": {
        // Edge N-gram (자동완성용)
        "autocomplete_tokenizer": {
          "type": "edge_ngram",
          "min_gram": 2,
          "max_gram": 10,
          "token_chars": ["letter", "digit"]
        },
        
        // N-gram
        "ngram_tokenizer": {
          "type": "ngram",
          "min_gram": 3,
          "max_gram": 4,
          "token_chars": ["letter", "digit"]
        },
        
        // Pattern
        "email_tokenizer": {
          "type": "pattern",
          "pattern": "@",
          "group": -1
        },
        
        // Path Hierarchy
        "path_tokenizer": {
          "type": "path_hierarchy",
          "delimiter": "/",
          "replacement": "/"
        }
      }
    }
  }
}
```

### Token Filters

```json
PUT token-filter-examples
{
  "settings": {
    "analysis": {
      "filter": {
        // Synonym
        "synonym_filter": {
          "type": "synonym",
          "synonyms": [
            "quick, fast, speedy",
            "jump, leap, hop",
            "elasticsearch, es => elastic"
          ]
        },
        
        // Synonym Graph
        "synonym_graph": {
          "type": "synonym_graph",
          "synonyms_path": "analysis/synonyms.txt",
          "updateable": true
        },
        
        // Stop Words
        "custom_stop": {
          "type": "stop",
          "stopwords": ["the", "is", "at", "which", "on"],
          "ignore_case": true
        },
        
        // Stemmer
        "english_stemmer": {
          "type": "stemmer",
          "language": "english"
        },
        
        // Shingle (단어 조합)
        "shingle_filter": {
          "type": "shingle",
          "min_shingle_size": 2,
          "max_shingle_size": 3,
          "output_unigrams": true
        },
        
        // Length
        "length_filter": {
          "type": "length",
          "min": 2,
          "max": 10
        },
        
        // Unique
        "unique_filter": {
          "type": "unique",
          "only_on_same_position": false
        }
      }
    }
  }
}
```

## 🌐 한국어 분석기 (Nori)

### Nori Analyzer 상세 설정

```json
PUT korean-advanced
{
  "settings": {
    "analysis": {
      "tokenizer": {
        "nori_user_dict": {
          "type": "nori_tokenizer",
          "decompound_mode": "mixed",
          "discard_punctuation": false,
          "user_dictionary": "userdict_ko.txt",
          "user_dictionary_rules": [
            "삼성전자",
            "SK하이닉스",
            "엘지전자"
          ]
        }
      },
      "filter": {
        "nori_stop": {
          "type": "nori_part_of_speech",
          "stoptags": [
            "E",    // 어미
            "IC",   // 감탄사
            "J",    // 조사
            "MAG",  // 부사
            "MAJ",  // 접속부사
            "MM",   // 관형사
            "SP",   // 쉼표, 가운뎃점, 콜론, 빗금
            "SSC",  // 닫는 괄호
            "SSO",  // 여는 괄호
            "SC",   // 구분자
            "SE",   // 줄임표
            "XPN",  // 접두사
            "XSA",  // 형용사 파생 접미사
            "XSN",  // 명사 파생 접미사
            "XSV",  // 동사 파생 접미사
            "UNA",  // 알 수 없는 단어
            "NA",   // 알 수 없는 단어
            "VSV"   // 동사
          ]
        },
        "nori_readingform": {
          "type": "nori_readingform"
        },
        "korean_synonym": {
          "type": "synonym",
          "synonyms": [
            "맥북, 맥북프로, macbook",
            "아이폰, iphone",
            "갤럭시, galaxy"
          ]
        }
      },
      "analyzer": {
        "korean_index_analyzer": {
          "type": "custom",
          "tokenizer": "nori_user_dict",
          "filter": [
            "nori_stop",
            "nori_readingform",
            "lowercase",
            "unique"
          ]
        },
        "korean_search_analyzer": {
          "type": "custom",
          "tokenizer": "nori_user_dict",
          "filter": [
            "nori_stop",
            "nori_readingform",
            "lowercase",
            "korean_synonym"
          ]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "title": {
        "type": "text",
        "analyzer": "korean_index_analyzer",
        "search_analyzer": "korean_search_analyzer"
      }
    }
  }
}
```

### 한국어 형태소 분석 테스트

```json
// 분석 테스트
POST korean-advanced/_analyze
{
  "analyzer": "korean_index_analyzer",
  "text": "삼성전자가 개발한 갤럭시 스마트폰은 세계 시장에서 인기가 많습니다"
}

// 디버깅
POST korean-advanced/_analyze
{
  "tokenizer": "nori_tokenizer",
  "filter": ["nori_part_of_speech"],
  "text": "한국어 형태소 분석기 테스트",
  "explain": true,
  "attributes": ["posType", "leftPOS", "rightPOS", "morphemes"]
}
```

## 🔬 고급 분석 패턴

### Fingerprint Analyzer (중복 제거)

```json
PUT fingerprint-index
{
  "settings": {
    "analysis": {
      "analyzer": {
        "fingerprint_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": [
            "lowercase",
            "asciifolding",
            "fingerprint"
          ]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "title": {
        "type": "text",
        "analyzer": "fingerprint_analyzer",
        "fields": {
          "raw": {
            "type": "keyword"
          }
        }
      }
    }
  }
}

// 중복 검색
GET fingerprint-index/_search
{
  "size": 0,
  "aggs": {
    "duplicate_titles": {
      "terms": {
        "field": "title",
        "min_doc_count": 2
      }
    }
  }
}
```

### Phonetic Analyzer (음성 유사성)

```json
PUT phonetic-index
{
  "settings": {
    "analysis": {
      "analyzer": {
        "phonetic_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": [
            "lowercase",
            "phonetic_filter"
          ]
        }
      },
      "filter": {
        "phonetic_filter": {
          "type": "phonetic",
          "encoder": "metaphone",
          "replace": false
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "name": {
        "type": "text",
        "analyzer": "phonetic_analyzer"
      }
    }
  }
}

// 유사 발음 검색
GET phonetic-index/_search
{
  "query": {
    "match": {
      "name": "jon"  // John, Jon 모두 매치
    }
  }
}
```

### Pattern Capture

```json
PUT pattern-capture-index
{
  "settings": {
    "analysis": {
      "filter": {
        "email_pattern": {
          "type": "pattern_capture",
          "preserve_original": true,
          "patterns": [
            "([^@]+)",           // username
            "@([^.]+)",          // domain name
            "@(.+)",             // full domain
            "([^@]+)@(.+)"       // full email
          ]
        }
      },
      "analyzer": {
        "email_analyzer": {
          "tokenizer": "uax_url_email",
          "filter": ["email_pattern", "lowercase", "unique"]
        }
      }
    }
  }
}
```

## 📊 분석기 성능 최적화

### Index vs Search Analyzer 분리

```json
PUT optimized-index
{
  "mappings": {
    "properties": {
      "description": {
        "type": "text",
        "analyzer": "index_heavy_analyzer",     // 인덱싱 시 상세 분석
        "search_analyzer": "search_light_analyzer"  // 검색 시 가벼운 분석
      }
    }
  },
  "settings": {
    "analysis": {
      "analyzer": {
        "index_heavy_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": [
            "lowercase",
            "stop",
            "snowball",
            "synonym",
            "shingle"
          ]
        },
        "search_light_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": [
            "lowercase",
            "stop"
          ]
        }
      }
    }
  }
}
```

### Normalizer (Keyword 필드용)

```json
PUT normalizer-index
{
  "settings": {
    "analysis": {
      "normalizer": {
        "lowercase_normalizer": {
          "type": "custom",
          "filter": ["lowercase", "asciifolding"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "email": {
        "type": "keyword",
        "normalizer": "lowercase_normalizer"
      }
    }
  }
}
```

## 🧪 분석기 테스트 및 디버깅

### 분석기 테스트 도구

```javascript
// analyzer-test.js
class AnalyzerTester {
  constructor(client) {
    this.client = client;
  }

  /**
   * 분석기 테스트
   */
  async testAnalyzer(indexName, analyzerName, text) {
    const response = await this.client.indices.analyze({
      index: indexName,
      body: {
        analyzer: analyzerName,
        text: text,
        explain: true
      }
    });

    return {
      tokens: response.tokens.map(t => ({
        token: t.token,
        position: t.position,
        startOffset: t.start_offset,
        endOffset: t.end_offset,
        type: t.type
      })),
      detail: response.detail
    };
  }

  /**
   * 여러 분석기 비교
   */
  async compareAnalyzers(text, analyzers) {
    const results = {};
    
    for (const analyzer of analyzers) {
      const response = await this.client.indices.analyze({
        body: {
          analyzer: analyzer,
          text: text
        }
      });
      
      results[analyzer] = response.tokens.map(t => t.token);
    }
    
    return results;
  }

  /**
   * 커스텀 분석 체인 테스트
   */
  async testCustomChain(text, charFilters, tokenizer, tokenFilters) {
    const response = await this.client.indices.analyze({
      body: {
        text: text,
        char_filter: charFilters,
        tokenizer: tokenizer,
        filter: tokenFilters
      }
    });

    return response.tokens;
  }
}
```

## 🎯 베스트 프랙티스

### 1. 분석기 설계 원칙
- **용도별 분리**: 인덱스용과 검색용 분석기 분리
- **언어별 최적화**: 각 언어에 맞는 분석기 사용
- **성능 고려**: 불필요한 필터 제거

### 2. 토큰화 전략
- **Precision vs Recall**: 정확도와 재현율 균형
- **동의어 처리**: 검색 시점에만 적용
- **형태소 분석**: 언어 특성 고려

### 3. 최적화 팁
- **캐싱 활용**: 자주 사용되는 분석 결과 캐싱
- **사전 관리**: 사용자 사전 정기 업데이트
- **테스트 자동화**: 분석기 변경 시 영향도 테스트

---

💡 **다음 단계**: [클러스터링](../clustering/README.md)에서 고급 클러스터 관리를 학습하세요!