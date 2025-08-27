# ⚡ Jobs & CronJobs 완벽 가이드

> 💡 **목표**: Kubernetes에서 배치 작업과 정기 작업을 효과적으로 관리하고, Job과 CronJob의 고급 기능을 마스터합니다.

## 📚 목차

1. [**Job 개념과 패턴**](#job-개념과-패턴)
2. [**Job 병렬 처리**](#job-병렬-처리)
3. [**CronJob 스케줄링**](#cronjob-스케줄링)
4. [**실전 시나리오**](#실전-시나리오)
5. [**Job 모니터링과 디버깅**](#job-모니터링과-디버깅)
6. [**고급 패턴**](#고급-패턴)
7. [**Best Practices**](#best-practices)

---

## 🎯 Job 개념과 패턴

### Job이란?

```mermaid
graph LR
    subgraph "Job Lifecycle"
        J[Job Created] --> P1[Pod 1 Running]
        J --> P2[Pod 2 Running]
        J --> P3[Pod 3 Running]
        
        P1 --> S1[Success]
        P2 --> F1[Failed] --> R1[Retry]
        P3 --> S2[Success]
        
        R1 --> S3[Success]
        
        S1 --> C[Job Complete]
        S2 --> C
        S3 --> C
    end
```

### 기본 Job 정의

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: simple-job
spec:
  # Job 완료 조건
  completions: 1          # 성공해야 할 Pod 수
  parallelism: 1          # 동시 실행 Pod 수
  backoffLimit: 6         # 재시도 횟수
  activeDeadlineSeconds: 3600  # Job 전체 타임아웃
  ttlSecondsAfterFinished: 100  # 완료 후 자동 삭제 (초)
  
  template:
    metadata:
      labels:
        app: batch-job
    spec:
      restartPolicy: OnFailure  # Never 또는 OnFailure
      containers:
      - name: worker
        image: busybox
        command: ['sh', '-c']
        args:
        - |
          echo "Starting job..."
          sleep 10
          echo "Job completed!"
          exit 0
```

### Job 패턴 비교

| 패턴 | completions | parallelism | 사용 사례 |
|------|------------|-------------|-----------|
| **단일 작업** | 1 | 1 | 데이터베이스 마이그레이션 |
| **고정 완료 수** | N | M | 배치 처리 |
| **작업 큐** | 1 | N | 메시지 처리 |
| **병렬 처리** | N | N | 대량 데이터 처리 |

---

## 🚀 Job 병렬 처리

### 병렬 처리 패턴

```yaml
# 패턴 1: 고정 완료 수 병렬 처리
apiVersion: batch/v1
kind: Job
metadata:
  name: parallel-job
spec:
  completions: 10    # 총 10개 작업 완료 필요
  parallelism: 3     # 동시에 3개씩 실행
  
  template:
    spec:
      restartPolicy: OnFailure
      containers:
      - name: worker
        image: busybox
        command: ['sh', '-c']
        args:
        - |
          # JOB_COMPLETION_INDEX 활용 (1.21+)
          echo "Processing batch $JOB_COMPLETION_INDEX"
          sleep $((RANDOM % 10 + 1))
          echo "Batch $JOB_COMPLETION_INDEX completed"

---
# 패턴 2: Work Queue 패턴
apiVersion: batch/v1
kind: Job
metadata:
  name: work-queue-job
spec:
  parallelism: 5     # 5개 워커 동시 실행
  completions: null  # 워커가 모두 성공하면 완료
  
  template:
    spec:
      restartPolicy: OnFailure
      containers:
      - name: worker
        image: myapp:worker
        env:
        - name: QUEUE_URL
          value: "redis://redis-service:6379"
        command: ['python']
        args:
        - -c
        - |
          import redis
          import time
          
          r = redis.from_url(os.environ['QUEUE_URL'])
          
          while True:
              job = r.blpop('job_queue', timeout=30)
              if not job:
                  break  # 큐가 비면 종료
              
              process_job(job[1])
              print(f"Processed: {job[1]}")
```

### Indexed Job (1.21+)

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: indexed-job
spec:
  completions: 5
  parallelism: 3
  completionMode: Indexed  # 인덱스 모드
  
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: worker
        image: busybox
        command: ['sh', '-c']
        args:
        - |
          echo "My index is: $JOB_COMPLETION_INDEX"
          
          # 인덱스별 다른 작업 수행
          case $JOB_COMPLETION_INDEX in
            0) echo "Processing dataset A";;
            1) echo "Processing dataset B";;
            2) echo "Processing dataset C";;
            3) echo "Processing dataset D";;
            4) echo "Processing dataset E";;
          esac
          
          sleep 10
          echo "Index $JOB_COMPLETION_INDEX completed"
```

### 동적 병렬 처리

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: dynamic-parallel-job
spec:
  parallelism: 10
  completions: 100
  
  template:
    spec:
      restartPolicy: OnFailure
      initContainers:
      # 작업 분할
      - name: job-splitter
        image: busybox
        command: ['sh', '-c']
        args:
        - |
          # 전체 작업을 청크로 분할
          TOTAL_ITEMS=1000000
          CHUNK_SIZE=$((TOTAL_ITEMS / 100))
          START=$((JOB_COMPLETION_INDEX * CHUNK_SIZE))
          END=$((START + CHUNK_SIZE))
          
          echo "START=$START" > /config/range
          echo "END=$END" >> /config/range
        volumeMounts:
        - name: config
          mountPath: /config
      
      containers:
      - name: processor
        image: myapp:processor
        command: ['sh', '-c']
        args:
        - |
          source /config/range
          echo "Processing items from $START to $END"
          
          # 실제 처리 로직
          process_batch --start=$START --end=$END
        volumeMounts:
        - name: config
          mountPath: /config
      
      volumes:
      - name: config
        emptyDir: {}
```

---

## 📅 CronJob 스케줄링

### CronJob 기본

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup-cronjob
spec:
  schedule: "0 2 * * *"  # 매일 새벽 2시
  
  # Job 설정
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  startingDeadlineSeconds: 200  # 늦은 시작 허용 시간
  concurrencyPolicy: Forbid     # 동시 실행 정책
  
  jobTemplate:
    spec:
      backoffLimit: 3
      ttlSecondsAfterFinished: 3600
      
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: backup
            image: backup-tool:latest
            command: ['/bin/bash']
            args:
            - -c
            - |
              DATE=$(date +%Y%m%d_%H%M%S)
              echo "Starting backup at $DATE"
              
              # 데이터베이스 백업
              mysqldump -h mysql-service -u root -p$MYSQL_PASSWORD \
                --all-databases > /backup/db_$DATE.sql
              
              # S3 업로드
              aws s3 cp /backup/db_$DATE.sql s3://my-backup-bucket/
              
              echo "Backup completed"
            
            env:
            - name: MYSQL_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: mysql-secret
                  key: password
            
            volumeMounts:
            - name: backup
              mountPath: /backup
          
          volumes:
          - name: backup
            emptyDir: {}
```

### Cron 스케줄 문법

```yaml
# ┌───────────── 분 (0 - 59)
# │ ┌───────────── 시 (0 - 23)
# │ │ ┌───────────── 일 (1 - 31)
# │ │ │ ┌───────────── 월 (1 - 12)
# │ │ │ │ ┌───────────── 요일 (0 - 6) (일요일 = 0 또는 7)
# │ │ │ │ │
# * * * * *

# 예제:
schedule: "*/5 * * * *"      # 5분마다
schedule: "0 * * * *"        # 매시간 정각
schedule: "0 0 * * *"        # 매일 자정
schedule: "0 0 * * 0"        # 매주 일요일 자정
schedule: "0 0 1 * *"        # 매월 1일 자정
schedule: "0 0 1 1 *"        # 매년 1월 1일
schedule: "30 2 * * 1-5"     # 평일 2:30 AM
schedule: "0 */6 * * *"      # 6시간마다
schedule: "@hourly"          # 매시간 (0 * * * *)
schedule: "@daily"           # 매일 (0 0 * * *)
schedule: "@weekly"          # 매주 (0 0 * * 0)
schedule: "@monthly"         # 매월 (0 0 1 * *)
schedule: "@yearly"          # 매년 (0 0 1 1 *)
```

### Concurrency Policy

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: concurrent-cronjob
spec:
  schedule: "*/1 * * * *"
  
  # Allow: 동시 실행 허용 (기본값)
  # Forbid: 이전 Job이 실행 중이면 건너뛰기
  # Replace: 이전 Job을 취소하고 새로 시작
  concurrencyPolicy: Forbid
  
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: long-running
            image: busybox
            command: ['sh', '-c', 'echo "Running for 90 seconds"; sleep 90']
```

---

## 💼 실전 시나리오

### 시나리오 1: 데이터베이스 마이그레이션

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
  annotations:
    "helm.sh/hook": pre-upgrade
    "helm.sh/hook-weight": "-5"
spec:
  backoffLimit: 1
  
  template:
    spec:
      restartPolicy: Never
      initContainers:
      # 데이터베이스 대기
      - name: wait-for-db
        image: busybox
        command: ['sh', '-c']
        args:
        - |
          until nc -z postgres-service 5432; do
            echo "Waiting for database..."
            sleep 2
          done
      
      containers:
      - name: migrate
        image: migrate/migrate:latest
        command: ['migrate']
        args:
        - -path=/migrations
        - -database=postgres://$(DB_USER):$(DB_PASS)@postgres-service/mydb?sslmode=disable
        - up
        
        env:
        - name: DB_USER
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: username
        - name: DB_PASS
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: password
        
        volumeMounts:
        - name: migrations
          mountPath: /migrations
      
      volumes:
      - name: migrations
        configMap:
          name: db-migrations
```

### 시나리오 2: ETL 파이프라인

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: etl-pipeline
spec:
  schedule: "0 1 * * *"  # 매일 새벽 1시
  
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          
          # ETL 단계별 컨테이너
          initContainers:
          # Extract
          - name: extract
            image: etl:extractor
            command: ['python', 'extract.py']
            env:
            - name: SOURCE_DB_URL
              value: "mysql://source-db:3306/data"
            volumeMounts:
            - name: data
              mountPath: /tmp/data
          
          # Transform
          - name: transform
            image: etl:transformer
            command: ['python', 'transform.py']
            volumeMounts:
            - name: data
              mountPath: /tmp/data
          
          # Load
          containers:
          - name: load
            image: etl:loader
            command: ['python', 'load.py']
            env:
            - name: TARGET_DB_URL
              value: "postgres://target-db:5432/warehouse"
            volumeMounts:
            - name: data
              mountPath: /tmp/data
            
            # 완료 알림
            lifecycle:
              postStart:
                exec:
                  command:
                  - /bin/sh
                  - -c
                  - |
                    curl -X POST https://hooks.slack.com/services/XXX \
                      -H 'Content-Type: application/json' \
                      -d '{"text":"ETL Pipeline started"}'
          
          volumes:
          - name: data
            emptyDir: {}
```

### 시나리오 3: 로그 정리 및 아카이빙

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: log-cleanup
spec:
  schedule: "0 3 * * 0"  # 매주 일요일 새벽 3시
  
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: cleanup
            image: busybox
            command: ['/bin/sh']
            args:
            - -c
            - |
              echo "Starting log cleanup..."
              
              # 7일 이상 된 로그 아카이빙
              find /logs -name "*.log" -mtime +7 -exec tar -czf {}.tar.gz {} \;
              find /logs -name "*.log" -mtime +7 -delete
              
              # 30일 이상 된 아카이브 삭제
              find /logs -name "*.tar.gz" -mtime +30 -delete
              
              # S3로 아카이브 업로드
              aws s3 sync /logs s3://log-archive/ --exclude "*.log"
              
              echo "Cleanup completed"
            
            volumeMounts:
            - name: logs
              mountPath: /logs
          
          volumes:
          - name: logs
            persistentVolumeClaim:
              claimName: logs-pvc
```

### 시나리오 4: 배치 이미지 처리

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: image-processing
spec:
  completions: 100
  parallelism: 10
  completionMode: Indexed
  
  template:
    spec:
      restartPolicy: OnFailure
      containers:
      - name: processor
        image: image-processor:latest
        command: ['python']
        args:
        - -c
        - |
          import os
          import boto3
          from PIL import Image
          
          # S3 클라이언트
          s3 = boto3.client('s3')
          
          # 작업 인덱스로 처리할 이미지 결정
          index = int(os.environ['JOB_COMPLETION_INDEX'])
          bucket = 'raw-images'
          
          # 이미지 목록 가져오기
          response = s3.list_objects_v2(
              Bucket=bucket,
              MaxKeys=1,
              StartAfter=f'image_{index:04d}.jpg'
          )
          
          if 'Contents' in response:
              key = response['Contents'][0]['Key']
              
              # 이미지 다운로드
              s3.download_file(bucket, key, '/tmp/input.jpg')
              
              # 이미지 처리
              img = Image.open('/tmp/input.jpg')
              
              # 썸네일 생성
              img.thumbnail((128, 128))
              img.save('/tmp/thumb.jpg')
              
              # 리사이즈
              img = img.resize((800, 600))
              img.save('/tmp/resized.jpg')
              
              # 업로드
              s3.upload_file('/tmp/thumb.jpg', 'thumbnails', key)
              s3.upload_file('/tmp/resized.jpg', 'processed', key)
              
              print(f"Processed {key}")
        
        env:
        - name: AWS_REGION
          value: us-west-2
        
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1"
```

### 시나리오 5: 인증서 갱신

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: cert-renewal
spec:
  schedule: "0 0 1 * *"  # 매월 1일
  
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: cert-manager
          restartPolicy: OnFailure
          
          containers:
          - name: renew
            image: certbot/certbot:latest
            command: ['/bin/sh']
            args:
            - -c
            - |
              # Let's Encrypt 인증서 갱신
              certbot renew \
                --non-interactive \
                --agree-tos \
                --email admin@example.com
              
              # Kubernetes Secret 업데이트
              kubectl create secret tls web-tls \
                --cert=/etc/letsencrypt/live/example.com/fullchain.pem \
                --key=/etc/letsencrypt/live/example.com/privkey.pem \
                --dry-run=client -o yaml | kubectl apply -f -
              
              # Deployment 재시작으로 새 인증서 적용
              kubectl rollout restart deployment/web-server
            
            volumeMounts:
            - name: certs
              mountPath: /etc/letsencrypt
          
          volumes:
          - name: certs
            persistentVolumeClaim:
              claimName: letsencrypt-pvc
```

---

## 📊 Job 모니터링과 디버깅

### Job 상태 확인

```bash
# Job 목록 및 상태
kubectl get jobs
kubectl describe job my-job

# Job의 Pod 확인
kubectl get pods --selector=job-name=my-job

# Job 이벤트 확인
kubectl get events --field-selector involvedObject.name=my-job

# Job 로그 확인
kubectl logs job/my-job
kubectl logs job/my-job --all-containers=true
kubectl logs job/my-job --previous

# CronJob 상태
kubectl get cronjobs
kubectl get jobs --selector=parent=my-cronjob
```

### Prometheus 메트릭

```yaml
apiVersion: v1
kind: ServiceMonitor
metadata:
  name: job-metrics
spec:
  selector:
    matchLabels:
      app: batch-job
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics

---
# Job 템플릿에 메트릭 추가
spec:
  template:
    spec:
      containers:
      - name: worker
        image: myapp:latest
        ports:
        - name: metrics
          containerPort: 9090
        env:
        - name: ENABLE_METRICS
          value: "true"
```

### 디버깅 Job

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: debug-job
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: debug
        image: nicolaka/netshoot
        command: ['sh', '-c']
        args:
        - |
          # 디버깅 정보 수집
          echo "=== Environment ==="
          env | sort
          
          echo "=== Network ==="
          ip addr
          nslookup kubernetes.default
          
          echo "=== Disk ==="
          df -h
          
          echo "=== Memory ==="
          free -h
          
          echo "=== CPU ==="
          nproc
          
          # 실제 작업
          echo "Starting actual job..."
          # ...
```

---

## 🎯 고급 패턴

### 1. Job 체이닝

```yaml
# Step 1: 데이터 준비
apiVersion: batch/v1
kind: Job
metadata:
  name: prepare-data
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: prepare
        image: busybox
        command: ['sh', '-c', 'echo "Preparing data..." && sleep 10']

---
# Step 2: 데이터 처리 (Step 1 완료 후 시작)
apiVersion: batch/v1
kind: Job
metadata:
  name: process-data
spec:
  template:
    spec:
      restartPolicy: Never
      initContainers:
      # 이전 Job 완료 대기
      - name: wait-prepare
        image: bitnami/kubectl
        command: ['sh', '-c']
        args:
        - |
          until kubectl get job prepare-data -o jsonpath='{.status.succeeded}' | grep -q "1"; do
            echo "Waiting for prepare-data job..."
            sleep 5
          done
      
      containers:
      - name: process
        image: busybox
        command: ['sh', '-c', 'echo "Processing data..." && sleep 10']
```

### 2. Sidecar Pattern Job

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: job-with-sidecar
spec:
  template:
    spec:
      restartPolicy: Never
      
      # 메인 컨테이너와 사이드카 공유
      shareProcessNamespace: true
      
      containers:
      # 메인 작업
      - name: main
        image: myapp:latest
        command: ['python', 'process.py']
        volumeMounts:
        - name: shared
          mountPath: /data
      
      # 모니터링 사이드카
      - name: monitor
        image: monitoring:latest
        command: ['sh', '-c']
        args:
        - |
          while true; do
            if ! pgrep -f "process.py" > /dev/null; then
              echo "Main process completed"
              exit 0
            fi
            
            # 메트릭 수집
            df -h /data
            ps aux | grep process.py
            
            sleep 10
          done
        volumeMounts:
        - name: shared
          mountPath: /data
      
      volumes:
      - name: shared
        emptyDir: {}
```

### 3. 실패 처리 패턴

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: fault-tolerant-job
spec:
  backoffLimit: 5
  
  template:
    spec:
      restartPolicy: OnFailure
      
      containers:
      - name: worker
        image: myapp:latest
        command: ['sh', '-c']
        args:
        - |
          # 재시도 로직
          RETRY_COUNT=${RETRY_COUNT:-0}
          MAX_RETRIES=3
          
          echo "Attempt $((RETRY_COUNT + 1)) of $((MAX_RETRIES + 1))"
          
          # 체크포인트 복구
          if [ -f /checkpoint/state ]; then
            echo "Resuming from checkpoint..."
            LAST_PROCESSED=$(cat /checkpoint/state)
          else
            LAST_PROCESSED=0
          fi
          
          # 작업 수행
          for i in $(seq $((LAST_PROCESSED + 1)) 100); do
            echo "Processing item $i"
            
            # 랜덤 실패 시뮬레이션
            if [ $((RANDOM % 10)) -eq 0 ]; then
              echo "Error processing item $i"
              echo $((i - 1)) > /checkpoint/state
              exit 1
            fi
            
            echo $i > /checkpoint/state
            sleep 1
          done
          
          echo "Job completed successfully"
        
        env:
        - name: RETRY_COUNT
          value: "0"
        
        volumeMounts:
        - name: checkpoint
          mountPath: /checkpoint
      
      volumes:
      - name: checkpoint
        persistentVolumeClaim:
          claimName: checkpoint-pvc
```

---

## ✅ Best Practices

### 1. 리소스 관리

```yaml
spec:
  template:
    spec:
      containers:
      - name: worker
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "1Gi"
            cpu: "500m"
      
      # Job 전용 노드 사용
      nodeSelector:
        workload: batch
      
      # 또는 tolerations
      tolerations:
      - key: "batch"
        operator: "Equal"
        value: "true"
        effect: "NoSchedule"
```

### 2. 타임아웃 설정

```yaml
spec:
  # Job 레벨 타임아웃
  activeDeadlineSeconds: 600
  
  template:
    spec:
      # Pod 레벨 타임아웃
      activeDeadlineSeconds: 300
      
      containers:
      - name: worker
        # 컨테이너 레벨 타임아웃
        livenessProbe:
          exec:
            command: ['cat', '/tmp/health']
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
```

### 3. 멱등성 보장

```yaml
spec:
  template:
    spec:
      containers:
      - name: idempotent-job
        command: ['sh', '-c']
        args:
        - |
          # 작업 ID 생성
          JOB_ID=$(echo $HOSTNAME | sha256sum | cut -c1-8)
          
          # 이미 처리됐는지 확인
          if redis-cli -h redis EXISTS "job:$JOB_ID"; then
            echo "Job $JOB_ID already processed"
            exit 0
          fi
          
          # 작업 수행
          process_job
          
          # 완료 표시
          redis-cli -h redis SET "job:$JOB_ID" "completed" EX 86400
```

### 4. 로깅과 모니터링

```yaml
spec:
  template:
    spec:
      containers:
      - name: worker
        env:
        # 구조화된 로깅
        - name: LOG_FORMAT
          value: "json"
        - name: LOG_LEVEL
          value: "info"
        
        # 메트릭 노출
        - name: ENABLE_METRICS
          value: "true"
        - name: METRICS_PORT
          value: "9090"
```

---

## 🔧 트러블슈팅

### Job이 완료되지 않음

```bash
# Pod 상태 확인
kubectl get pods -l job-name=my-job

# 실패한 Pod 로그 확인
kubectl logs -l job-name=my-job --tail=50

# Job 이벤트 확인
kubectl describe job my-job

# 강제 종료
kubectl delete job my-job --cascade=foreground
```

### CronJob이 실행되지 않음

```bash
# CronJob 일시 중지 확인
kubectl get cronjob my-cronjob -o jsonpath='{.spec.suspend}'

# 재활성화
kubectl patch cronjob my-cronjob -p '{"spec":{"suspend":false}}'

# 수동 트리거
kubectl create job --from=cronjob/my-cronjob manual-run
```

### 메모리 부족

```yaml
# OOMKilled 방지
spec:
  template:
    spec:
      containers:
      - name: worker
        resources:
          requests:
            memory: "512Mi"
          limits:
            memory: "1Gi"
        env:
        # JVM 앱의 경우
        - name: JAVA_OPTS
          value: "-Xmx768m -Xms512m"
```

---

## 💡 고급 팁

### 1. Job 템플릿 재사용

```bash
# CronJob에서 Job 생성
kubectl create job manual-backup --from=cronjob/backup-cronjob

# Job 복제
kubectl get job old-job -o yaml | \
  sed 's/name: old-job/name: new-job/' | \
  kubectl create -f -
```

### 2. 동적 Job 생성

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: job-generator
data:
  generate.sh: |
    #!/bin/bash
    for i in {1..10}; do
      cat <<EOF | kubectl apply -f -
    apiVersion: batch/v1
    kind: Job
    metadata:
      name: dynamic-job-$i
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
          - name: worker
            image: busybox
            command: ['echo', "Processing batch $i"]
    EOF
    done
```

### 3. Job 우선순위

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-priority-batch
value: 1000

---
spec:
  template:
    spec:
      priorityClassName: high-priority-batch
```

---

> 🚀 Jobs와 CronJobs는 Kubernetes에서 배치 작업과 정기 작업을 관리하는 강력한 도구입니다!