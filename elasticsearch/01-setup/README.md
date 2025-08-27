# 🐳 Elasticsearch Docker 환경 설정 가이드

## 🎯 목표

로컬 환경에서 Elasticsearch + Kibana 클러스터를 구축하고 실습할 수 있는 환경을 만듭니다.

## 📦 필요한 도구

- Docker Desktop
- Docker Compose
- 최소 4GB RAM (권장 8GB)
- 10GB 이상의 디스크 공간

## 🚀 빠른 시작

### 1. 단일 노드 설치

```bash
# Elasticsearch 실행
docker run -d \
  --name elasticsearch \
  -p 9200:9200 \
  -p 9300:9300 \
  -e "discovery.type=single-node" \
  -e "xpack.security.enabled=false" \
  -e "ES_JAVA_OPTS=-Xms512m -Xmx512m" \
  docker.elastic.co/elasticsearch/elasticsearch:8.11.0

# Kibana 실행
docker run -d \
  --name kibana \
  --link elasticsearch \
  -p 5601:5601 \
  -e "ELASTICSEARCH_HOSTS=http://elasticsearch:9200" \
  docker.elastic.co/kibana/kibana:8.11.0

# 확인
curl http://localhost:9200
```

### 2. Docker Compose로 클러스터 구성

#### docker-compose.yml

```yaml
version: '3.8'

services:
  # Elasticsearch 마스터 노드
  es01:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    container_name: es01
    environment:
      - node.name=es01
      - cluster.name=es-docker-cluster
      - discovery.seed_hosts=es02,es03
      - cluster.initial_master_nodes=es01,es02,es03
      - bootstrap.memory_lock=true
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms1g -Xmx1g"
    ulimits:
      memlock:
        soft: -1
        hard: -1
    volumes:
      - data01:/usr/share/elasticsearch/data
    ports:
      - 9200:9200
    networks:
      - elastic

  # Elasticsearch 데이터 노드 2
  es02:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    container_name: es02
    environment:
      - node.name=es02
      - cluster.name=es-docker-cluster
      - discovery.seed_hosts=es01,es03
      - cluster.initial_master_nodes=es01,es02,es03
      - bootstrap.memory_lock=true
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms1g -Xmx1g"
    ulimits:
      memlock:
        soft: -1
        hard: -1
    volumes:
      - data02:/usr/share/elasticsearch/data
    networks:
      - elastic

  # Elasticsearch 데이터 노드 3
  es03:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    container_name: es03
    environment:
      - node.name=es03
      - cluster.name=es-docker-cluster
      - discovery.seed_hosts=es01,es02
      - cluster.initial_master_nodes=es01,es02,es03
      - bootstrap.memory_lock=true
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms1g -Xmx1g"
    ulimits:
      memlock:
        soft: -1
        hard: -1
    volumes:
      - data03:/usr/share/elasticsearch/data
    networks:
      - elastic

  # Kibana
  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    container_name: kibana
    ports:
      - 5601:5601
    environment:
      - ELASTICSEARCH_HOSTS=["http://es01:9200","http://es02:9200","http://es03:9200"]
      - ELASTICSEARCH_USERNAME=kibana_system
      - ELASTICSEARCH_PASSWORD=${KIBANA_PASSWORD:-}
    networks:
      - elastic
    depends_on:
      - es01
      - es02
      - es03

  # Cerebro (Elasticsearch 관리 도구)
  cerebro:
    image: lmenezes/cerebro:0.9.4
    container_name: cerebro
    ports:
      - 9000:9000
    networks:
      - elastic
    command:
      - -Dhosts.0.host=http://es01:9200

volumes:
  data01:
    driver: local
  data02:
    driver: local
  data03:
    driver: local

networks:
  elastic:
    driver: bridge
```

### 3. 환경 변수 설정 (.env)

```bash
# .env
STACK_VERSION=8.11.0
CLUSTER_NAME=es-docker-cluster
LICENSE=basic
ES_PORT=9200
KIBANA_PORT=5601
MEM_LIMIT=1073741824
```

### 4. 실행 및 확인

```bash
# Docker Compose 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f

# 클러스터 상태 확인
curl -X GET "localhost:9200/_cluster/health?pretty"

# 노드 정보 확인
curl -X GET "localhost:9200/_nodes?pretty"
```

## 🔧 고급 설정

### 1. 보안 활성화

#### docker-compose-secure.yml

```yaml
version: '3.8'

services:
  setup:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    volumes:
      - certs:/usr/share/elasticsearch/config/certs
    user: "0"
    command: >
      bash -c '
        if [ x${ELASTIC_PASSWORD} == x ]; then
          echo "Set the ELASTIC_PASSWORD environment variable in the .env file";
          exit 1;
        elif [ x${KIBANA_PASSWORD} == x ]; then
          echo "Set the KIBANA_PASSWORD environment variable in the .env file";
          exit 1;
        fi;
        if [ ! -f config/certs/ca.zip ]; then
          echo "Creating CA";
          bin/elasticsearch-certutil ca --silent --pem -out config/certs/ca.zip;
          unzip config/certs/ca.zip -d config/certs;
        fi;
        if [ ! -f config/certs/certs.zip ]; then
          echo "Creating certs";
          bin/elasticsearch-certutil cert --silent --pem -out config/certs/certs.zip --in config/certs/instances.yml --ca-cert config/certs/ca/ca.crt --ca-key config/certs/ca/ca.key;
          unzip config/certs/certs.zip -d config/certs;
        fi;
        echo "Setting file permissions"
        chown -R root:root config/certs;
        find . -type d -exec chmod 750 \{\} \;;
        find . -type f -exec chmod 640 \{\} \;;
        echo "Waiting for Elasticsearch availability";
        until curl -s --cacert config/certs/ca/ca.crt https://es01:9200 | grep -q "missing authentication credentials"; do sleep 5; done;
        echo "Setting kibana_system password";
        until curl -s -X POST --cacert config/certs/ca/ca.crt -u elastic:${ELASTIC_PASSWORD} -H "Content-Type: application/json" https://es01:9200/_security/user/kibana_system/_password -d "{\"password\":\"${KIBANA_PASSWORD}\"}" | grep -q "^{}"; do sleep 5; done;
        echo "All done!";
      '
    healthcheck:
      test: ["CMD-SHELL", "[ -f config/certs/es01/es01.crt ]"]
      interval: 1s
      timeout: 5s
      retries: 120

  es01:
    depends_on:
      setup:
        condition: service_healthy
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    volumes:
      - certs:/usr/share/elasticsearch/config/certs
      - esdata01:/usr/share/elasticsearch/data
    ports:
      - 9200:9200
    environment:
      - node.name=es01
      - cluster.name=${CLUSTER_NAME}
      - cluster.initial_master_nodes=es01,es02,es03
      - discovery.seed_hosts=es02,es03
      - ELASTIC_PASSWORD=${ELASTIC_PASSWORD}
      - bootstrap.memory_lock=true
      - xpack.security.enabled=true
      - xpack.security.http.ssl.enabled=true
      - xpack.security.http.ssl.key=certs/es01/es01.key
      - xpack.security.http.ssl.certificate=certs/es01/es01.crt
      - xpack.security.http.ssl.certificate_authorities=certs/ca/ca.crt
      - xpack.security.transport.ssl.enabled=true
      - xpack.security.transport.ssl.key=certs/es01/es01.key
      - xpack.security.transport.ssl.certificate=certs/es01/es01.crt
      - xpack.security.transport.ssl.certificate_authorities=certs/ca/ca.crt
      - xpack.security.transport.ssl.verification_mode=certificate
      - xpack.license.self_generated.type=${LICENSE}
    mem_limit: ${MEM_LIMIT}
    ulimits:
      memlock:
        soft: -1
        hard: -1

volumes:
  certs:
    driver: local
  esdata01:
    driver: local
```

### 2. 성능 튜닝 설정

#### elasticsearch.yml

```yaml
# 클러스터 설정
cluster.name: es-docker-cluster
node.name: es01
node.roles: [master, data]

# 네트워크 설정
network.host: 0.0.0.0
http.port: 9200
transport.port: 9300

# 메모리 설정
indices.memory.index_buffer_size: 30%
indices.queries.cache.size: 15%
indices.fielddata.cache.size: 20%

# Thread Pool 설정
thread_pool:
  search:
    size: 20
    queue_size: 1000
  index:
    size: 10
    queue_size: 200
  bulk:
    size: 10
    queue_size: 50

# 샤드 설정
index.number_of_shards: 3
index.number_of_replicas: 1

# 리프레시 설정
index.refresh_interval: 5s

# 병합 설정
index.merge.scheduler.max_thread_count: 2
```

### 3. JVM 설정

#### jvm.options

```bash
# Heap 크기 (시스템 메모리의 50% 이하, 최대 32GB)
-Xms2g
-Xmx2g

# GC 설정
-XX:+UseG1GC
-XX:G1ReservePercent=25
-XX:InitiatingHeapOccupancyPercent=30

# GC 로그
-Xlog:gc*,gc+age=trace,safepoint:file=/usr/share/elasticsearch/logs/gc.log:utctime,pid,tags:filecount=32,filesize=64m

# 힙 덤프 생성 경로
-XX:HeapDumpPath=/usr/share/elasticsearch/data

# 에러 발생 시 힙 덤프
-XX:+HeapDumpOnOutOfMemoryError
```

## 📊 모니터링 설정

### 1. Metricbeat 추가

```yaml
# docker-compose에 추가
metricbeat:
  image: docker.elastic.co/beats/metricbeat:8.11.0
  container_name: metricbeat
  user: root
  volumes:
    - ./metricbeat.yml:/usr/share/metricbeat/metricbeat.yml:ro
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - /sys/fs/cgroup:/hostfs/sys/fs/cgroup:ro
    - /proc:/hostfs/proc:ro
    - /:/hostfs:ro
  command: metricbeat -e -strict.perms=false
  networks:
    - elastic
  depends_on:
    - es01
```

### 2. Metricbeat 설정

#### metricbeat.yml

```yaml
metricbeat.modules:
- module: elasticsearch
  xpack.enabled: true
  period: 10s
  hosts: ["http://es01:9200"]

- module: docker
  metricsets:
    - container
    - cpu
    - diskio
    - healthcheck
    - info
    - memory
    - network
  hosts: ["unix:///var/run/docker.sock"]
  period: 10s

output.elasticsearch:
  hosts: ["es01:9200"]

setup.kibana:
  host: "kibana:5601"

setup.dashboards.enabled: true
```

## 🧪 문제 해결

### 1. 메모리 부족

```bash
# Docker Desktop 메모리 증가
# Settings > Resources > Memory: 4GB 이상

# vm.max_map_count 설정
sudo sysctl -w vm.max_map_count=262144

# 영구 설정
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```

### 2. 포트 충돌

```yaml
# docker-compose.yml에서 포트 변경
ports:
  - 9201:9200  # 9201로 변경
  - 5602:5601  # Kibana 포트도 변경
```

### 3. 컨테이너 재시작

```bash
# 모든 컨테이너 정지
docker-compose down

# 볼륨 삭제 (데이터 초기화)
docker-compose down -v

# 재시작
docker-compose up -d

# 로그 확인
docker-compose logs -f es01
```

## 🔍 클러스터 테스트

### 1. 클러스터 상태 확인

```bash
# 클러스터 건강 상태
curl -X GET "localhost:9200/_cluster/health?pretty"

# 노드 정보
curl -X GET "localhost:9200/_cat/nodes?v"

# 인덱스 목록
curl -X GET "localhost:9200/_cat/indices?v"

# 샤드 정보
curl -X GET "localhost:9200/_cat/shards?v"
```

### 2. 테스트 데이터 삽입

```bash
# 테스트 인덱스 생성
curl -X PUT "localhost:9200/test-index" -H 'Content-Type: application/json' -d'
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1
  },
  "mappings": {
    "properties": {
      "title": { "type": "text" },
      "created": { "type": "date" }
    }
  }
}'

# 문서 삽입
curl -X POST "localhost:9200/test-index/_doc" -H 'Content-Type: application/json' -d'
{
  "title": "Elasticsearch Test",
  "created": "2024-01-15"
}'

# 검색
curl -X GET "localhost:9200/test-index/_search?pretty"
```

## 🎓 실습 환경 검증

### Kibana Dev Tools에서 실행

1. http://localhost:5601 접속
2. Dev Tools 메뉴 선택
3. Console에서 명령어 실행

```json
# 클러스터 정보
GET /

# 클러스터 상태
GET /_cluster/health

# 노드 정보
GET /_nodes/stats

# 인덱스 생성
PUT /products
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1
  },
  "mappings": {
    "properties": {
      "name": { "type": "text" },
      "price": { "type": "float" },
      "category": { "type": "keyword" }
    }
  }
}

# 문서 삽입
POST /products/_doc
{
  "name": "Laptop",
  "price": 1500000,
  "category": "electronics"
}

# 검색
GET /products/_search
{
  "query": {
    "match": {
      "name": "laptop"
    }
  }
}
```

## 🎯 베스트 프랙티스

### 1. 리소스 할당

```yaml
# 각 노드에 최소 2GB RAM
ES_JAVA_OPTS: "-Xms2g -Xmx2g"

# 컨테이너 메모리 제한
mem_limit: 4g
```

### 2. 네트워크 분리

```yaml
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
```

### 3. 데이터 지속성

```yaml
volumes:
  - ./elasticsearch/data:/usr/share/elasticsearch/data
  - ./elasticsearch/config:/usr/share/elasticsearch/config
```

### 4. 헬스 체크

```yaml
healthcheck:
  test: ["CMD-SHELL", "curl --silent --fail localhost:9200/_cluster/health || exit 1"]
  interval: 30s
  timeout: 10s
  retries: 5
```

## 📑 참고 자료

- [Elasticsearch Docker Documentation](https://www.elastic.co/guide/en/elasticsearch/reference/current/docker.html)
- [Docker Compose Samples](https://github.com/elastic/elasticsearch/tree/master/docs/reference/setup/install/docker)
- [Elasticsearch Configuration](https://www.elastic.co/guide/en/elasticsearch/reference/current/settings.html)

---

💡 **다음 단계**: [Indexing 실습](../02-indexing/README.md)에서 데이터 인덱싱을 학습해보세요!