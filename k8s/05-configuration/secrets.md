# 🔒 Kubernetes Secrets 완벽 가이드

> 💡 **목표**: Secret을 활용하여 민감한 정보를 안전하게 저장하고 관리하는 방법을 마스터합니다.

## 📚 목차

1. [**Secret이란?**](#secret이란)
2. [**Secret 타입과 생성**](#secret-타입과-생성)  
3. [**Secret 사용 패턴**](#secret-사용-패턴)
4. [**보안 강화 방법**](#보안-강화-방법)
5. [**실전 예제**](#실전-예제)
6. [**Best Practices**](#best-practices)

---

## 🔐 Secret이란?

### Secret vs ConfigMap

| 특성 | Secret | ConfigMap |
|-----|--------|-----------|
| **용도** | 민감 정보 (비밀번호, 토큰) | 일반 설정 |
| **저장 방식** | Base64 인코딩 + etcd 암호화 | 평문 |
| **크기 제한** | 1MB | 1MB |
| **접근 제어** | RBAC 세밀한 제어 | 일반 접근 제어 |
| **감사** | 감사 로그 기록 | 일반 로그 |

```mermaid
graph LR
    subgraph "Secret 보안 레이어"
        A[Secret 생성] --> B[Base64 인코딩]
        B --> C[etcd 암호화]
        C --> D[전송 시 TLS]
        D --> E[RBAC 접근 제어]
        E --> F[Pod에 전달]
    end
```

---

## 🔑 Secret 타입과 생성

### Secret 타입

| 타입 | 용도 | 필수 필드 |
|------|------|-----------|
| **Opaque** | 일반 비밀 데이터 | 자유 형식 |
| **kubernetes.io/service-account-token** | ServiceAccount 토큰 | 자동 생성 |
| **kubernetes.io/dockerconfigjson** | Docker 레지스트리 인증 | .dockerconfigjson |
| **kubernetes.io/basic-auth** | 기본 인증 | username, password |
| **kubernetes.io/ssh-auth** | SSH 인증 | ssh-privatekey |
| **kubernetes.io/tls** | TLS 인증서 | tls.crt, tls.key |

### 1. Generic Secret (Opaque)

```bash
# 리터럴 값으로 생성
kubectl create secret generic db-secret \
  --from-literal=username=admin \
  --from-literal=password='S3cur3P@ssw0rd!'

# 파일에서 생성
echo -n 'admin' > username.txt
echo -n 'S3cur3P@ssw0rd!' > password.txt
kubectl create secret generic db-secret \
  --from-file=username=username.txt \
  --from-file=password=password.txt

# YAML로 생성
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
type: Opaque
data:
  username: YWRtaW4=  # echo -n 'admin' | base64
  password: UzNjdXIzUEBzc3cwcmQh  # echo -n 'S3cur3P@ssw0rd!' | base64
stringData:  # 평문 입력 (자동 base64 변환)
  database: mydb
  port: "5432"
EOF
```

### 2. Docker Registry Secret

```bash
# Docker Hub
kubectl create secret docker-registry dockerhub-secret \
  --docker-server=docker.io \
  --docker-username=myuser \
  --docker-password=mypassword \
  --docker-email=myuser@example.com

# Private Registry
kubectl create secret docker-registry private-reg-secret \
  --docker-server=registry.example.com:5000 \
  --docker-username=admin \
  --docker-password=secretpassword

# ECR (AWS)
kubectl create secret docker-registry ecr-secret \
  --docker-server=123456789012.dkr.ecr.us-east-1.amazonaws.com \
  --docker-username=AWS \
  --docker-password=$(aws ecr get-login-password)
```

사용:
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: private-app
spec:
  imagePullSecrets:
  - name: dockerhub-secret
  containers:
  - name: app
    image: myuser/private-app:1.0
```

### 3. TLS Secret

```bash
# 자체 서명 인증서 생성
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout tls.key -out tls.crt \
  -subj "/CN=myapp.example.com/O=myapp"

# TLS Secret 생성
kubectl create secret tls myapp-tls \
  --cert=tls.crt \
  --key=tls.key

# Let's Encrypt with cert-manager
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: myapp-cert
spec:
  secretName: myapp-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
  - myapp.example.com
  - www.myapp.example.com
EOF
```

### 4. SSH Auth Secret

```bash
# SSH 키 생성
ssh-keygen -t rsa -b 4096 -f id_rsa -N ""

# Secret 생성
kubectl create secret generic ssh-secret \
  --from-file=ssh-privatekey=id_rsa \
  --from-file=ssh-publickey=id_rsa.pub \
  --type=kubernetes.io/ssh-auth
```

### 5. Basic Auth Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: basic-auth
type: kubernetes.io/basic-auth
stringData:
  username: admin
  password: secretpassword
```

---

## 📦 Secret 사용 패턴

### 패턴 1: 환경 변수로 사용

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  template:
    spec:
      containers:
      - name: app
        image: myapp:1.0
        env:
        # 개별 key 참조
        - name: DB_USERNAME
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: username
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: password
              optional: false  # 필수 (기본값)
        
        # 전체 Secret을 환경변수로
        envFrom:
        - secretRef:
            name: db-secret
          prefix: DATABASE_  # PREFIX 추가
```

### 패턴 2: Volume으로 마운트

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  containers:
  - name: app
    image: myapp:1.0
    volumeMounts:
    # 전체 Secret 마운트
    - name: secret-volume
      mountPath: /etc/secrets
      readOnly: true
    
    # 특정 key만 마운트
    - name: db-password
      mountPath: /etc/secrets/db-password
      subPath: password
      readOnly: true
      
  volumes:
  - name: secret-volume
    secret:
      secretName: db-secret
      defaultMode: 0400  # 읽기 전용
      
  - name: db-password
    secret:
      secretName: db-secret
      items:
      - key: password
        path: db-password
        mode: 0400
```

### 패턴 3: ServiceAccount 토큰

```yaml
# ServiceAccount 생성
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app-sa
secrets:
- name: app-sa-token

---
# Pod에서 사용
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  serviceAccountName: app-sa
  containers:
  - name: app
    image: myapp:1.0
    # 자동으로 마운트됨: /var/run/secrets/kubernetes.io/serviceaccount/
```

---

## 🛡️ 보안 강화 방법

### 1. etcd 암호화 활성화

```yaml
# encryption-config.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
    - secrets
    providers:
    - aescbc:
        keys:
        - name: key1
          secret: <base64-encoded-secret>
    - identity: {}
```

```bash
# API Server 설정
--encryption-provider-config=/etc/kubernetes/encryption-config.yaml
```

### 2. RBAC으로 접근 제어

```yaml
# Secret 읽기 권한만 부여
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: secret-reader
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list"]
  resourceNames: ["app-secret"]  # 특정 Secret만

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-secrets
subjects:
- kind: ServiceAccount
  name: app-sa
roleRef:
  kind: Role
  name: secret-reader
  apiGroup: rbac.authorization.k8s.io
```

### 3. Sealed Secrets 사용

```bash
# Sealed Secrets Controller 설치
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.18.0/controller.yaml

# kubeseal CLI 설치
brew install kubeseal

# Secret 암호화
echo -n mypassword | kubectl create secret generic mysecret \
  --dry-run=client --from-file=password=/dev/stdin -o yaml | \
  kubeseal -o yaml > mysealedsecret.yaml

# 적용 (자동으로 복호화됨)
kubectl apply -f mysealedsecret.yaml
```

### 4. External Secrets Operator

```yaml
# External Secret 설정
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: vault-backend
spec:
  provider:
    vault:
      server: "https://vault.example.com:8200"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "demo"

---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: vault-secret
spec:
  secretStoreRef:
    name: vault-backend
    kind: SecretStore
  target:
    name: app-secret
  data:
  - secretKey: password
    remoteRef:
      key: secret/data/database
      property: password
```

### 5. 보안 스캐닝

```bash
# Secret 노출 검사
kubectl get pods -o yaml | grep -E '(password|secret|token|key)'

# 감사 로그 확인
kubectl logs -n kube-system kube-apiserver-master | grep secrets
```

---

## 💼 실전 예제

### 예제 1: 데이터베이스 연결

```yaml
# Database Secret
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
type: Opaque
stringData:
  POSTGRES_USER: postgres
  POSTGRES_PASSWORD: "MyS3cur3P@ssw0rd!"
  POSTGRES_DB: myapp
  
---
# Application Secret
apiVersion: v1
kind: Secret
metadata:
  name: app-db-secret
type: Opaque
stringData:
  DATABASE_URL: "postgresql://postgres:MyS3cur3P@ssw0rd!@postgres:5432/myapp?sslmode=require"
  
---
# PostgreSQL Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:14
        envFrom:
        - secretRef:
            name: postgres-secret
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: postgres-data
          mountPath: /var/lib/postgresql/data
      volumes:
      - name: postgres-data
        persistentVolumeClaim:
          claimName: postgres-pvc
          
---
# Application Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: app
        image: myapp:1.0
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: app-db-secret
              key: DATABASE_URL
        ports:
        - containerPort: 8080
```

### 예제 2: API 키 관리

```yaml
# Multiple API Keys
apiVersion: v1
kind: Secret
metadata:
  name: api-keys
type: Opaque
data:
  stripe-key: c2tfdGVzdF8xMjM0NTY3ODkw
  sendgrid-key: U0cuMTIzNDU2Nzg5MC5hYmNkZWZnaGlqa2xtbg==
  aws-access-key: QUtJQUlPU0ZPRE5ON0VYQU1QTEU=
  aws-secret-key: d0phbHJYVXRuRkVNSS9LN01ERU5HL2JQeFJmaUNZRVhBTVBMRUtFWQ==
  
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-service
spec:
  template:
    spec:
      containers:
      - name: api
        image: api-service:1.0
        env:
        - name: STRIPE_API_KEY
          valueFrom:
            secretKeyRef:
              name: api-keys
              key: stripe-key
        - name: SENDGRID_API_KEY
          valueFrom:
            secretKeyRef:
              name: api-keys
              key: sendgrid-key
        - name: AWS_ACCESS_KEY_ID
          valueFrom:
            secretKeyRef:
              name: api-keys
              key: aws-access-key
        - name: AWS_SECRET_ACCESS_KEY
          valueFrom:
            secretKeyRef:
              name: api-keys
              key: aws-secret-key
```

### 예제 3: TLS 인증서 관리

```yaml
# Ingress with TLS
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - app.example.com
    - www.app.example.com
    secretName: app-tls
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: app
            port:
              number: 80
              
---
# Certificate (cert-manager)
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: app-cert
spec:
  secretName: app-tls
  duration: 2160h  # 90 days
  renewBefore: 360h  # 15 days
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
  - app.example.com
  - www.app.example.com
```

### 예제 4: Git 저장소 인증

```yaml
# Git SSH Secret
apiVersion: v1
kind: Secret
metadata:
  name: git-ssh
type: kubernetes.io/ssh-auth
data:
  ssh-privatekey: |
    LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQpNSUlFcEFJQkFBS0NBUUVB...
    
---
# Git HTTPS Secret
apiVersion: v1
kind: Secret
metadata:
  name: git-https
type: Opaque
stringData:
  username: git-user
  password: ghp_xxxxxxxxxxxxxxxxxxxx  # GitHub Personal Access Token
  
---
# ArgoCD Application
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
spec:
  source:
    repoURL: git@github.com:myorg/myapp.git
    targetRevision: HEAD
    path: k8s
  destination:
    server: https://kubernetes.default.svc
  syncPolicy:
    automated:
      prune: true
```

### 예제 5: Multi-Cloud 인증

```yaml
# AWS Credentials
apiVersion: v1
kind: Secret
metadata:
  name: aws-creds
type: Opaque
stringData:
  credentials: |
    [default]
    aws_access_key_id = AKIAIOSFODNN7EXAMPLE
    aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
    
---
# GCP Service Account
apiVersion: v1
kind: Secret
metadata:
  name: gcp-sa
type: Opaque
data:
  key.json: ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIs...
  
---
# Azure Service Principal
apiVersion: v1
kind: Secret
metadata:
  name: azure-sp
type: Opaque
stringData:
  AZURE_CLIENT_ID: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  AZURE_CLIENT_SECRET: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  AZURE_TENANT_ID: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  
---
# Multi-Cloud App
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cloud-app
spec:
  template:
    spec:
      containers:
      - name: app
        image: cloud-app:1.0
        volumeMounts:
        - name: aws-creds
          mountPath: /root/.aws
        - name: gcp-sa
          mountPath: /var/secrets/gcp
        env:
        - name: GOOGLE_APPLICATION_CREDENTIALS
          value: /var/secrets/gcp/key.json
        envFrom:
        - secretRef:
            name: azure-sp
      volumes:
      - name: aws-creds
        secret:
          secretName: aws-creds
      - name: gcp-sa
        secret:
          secretName: gcp-sa
```

---

## ✅ Best Practices

### 1. 최소 권한 원칙

```yaml
# 특정 네임스페이스, 특정 Secret만 접근
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: app-secret-reader
  namespace: production
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get"]
  resourceNames: ["app-secret", "db-secret"]
```

### 2. Secret 로테이션

```bash
#!/bin/bash
# Secret 자동 로테이션 스크립트

# 새 비밀번호 생성
NEW_PASSWORD=$(openssl rand -base64 32)

# Secret 업데이트
kubectl create secret generic db-secret \
  --from-literal=password=$NEW_PASSWORD \
  --dry-run=client -o yaml | kubectl apply -f -

# Deployment 재시작
kubectl rollout restart deployment/app

# 데이터베이스 비밀번호 변경
kubectl exec -it postgres-0 -- psql -U postgres -c "ALTER USER myuser PASSWORD '$NEW_PASSWORD';"
```

### 3. 암호화된 GitOps

```yaml
# Sealed Secrets with ArgoCD
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: db-secret
  namespace: production
spec:
  encryptedData:
    password: AgXZOL8KPD5jkPE...  # 암호화된 데이터
  template:
    type: Opaque
```

### 4. 네임스페이스 격리

```yaml
# NetworkPolicy로 Secret 접근 격리
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-secret-access
spec:
  podSelector:
    matchLabels:
      access-secrets: "false"
  policyTypes:
  - Ingress
  - Egress
```

### 5. 감사 로깅

```yaml
# Audit Policy
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
- level: RequestResponse
  omitStages:
  - RequestReceived
  resources:
  - group: ""
    resources: ["secrets"]
  namespaces: ["production", "staging"]
```

---

## 🔧 트러블슈팅

### Secret이 Pod에 마운트되지 않음

```bash
# Secret 존재 확인
kubectl get secret db-secret

# Pod 상태 확인
kubectl describe pod app-pod

# 권한 확인
kubectl auth can-i get secrets --as=system:serviceaccount:default:default
```

### Base64 인코딩 문제

```bash
# 올바른 인코딩 (개행 없음)
echo -n 'password' | base64

# 잘못된 인코딩 (개행 포함)
echo 'password' | base64

# 디코딩 확인
echo 'cGFzc3dvcmQ=' | base64 -d
```

### Secret 크기 초과

```bash
# Secret 크기 확인 (1MB 제한)
kubectl get secret large-secret -o yaml | wc -c

# 대용량 데이터는 ConfigMap 분할 또는 Volume 사용
```

---

## 💡 고급 팁

### 1. Secret 백업

```bash
# 모든 Secret 백업
kubectl get secrets -A -o yaml > secrets-backup.yaml

# 암호화하여 백업
kubectl get secrets -A -o yaml | \
  gpg --encrypt --recipient backup@example.com > secrets-backup.yaml.gpg
```

### 2. Secret 동기화

```yaml
# Kubernetes Secret을 Vault와 동기화
apiVersion: secrets.hashicorp.com/v1beta1
kind: VaultAuth
metadata:
  name: vault-auth
spec:
  method: kubernetes
  kubernetes:
    role: demo
    
---
apiVersion: secrets.hashicorp.com/v1beta1
kind: VaultStaticSecret
metadata:
  name: vault-secret
spec:
  vaultAuthRef: vault-auth
  path: kvv2/data/database
  destination:
    name: db-secret
    create: true
```

### 3. 임시 Secret

```yaml
# Job 완료 후 자동 삭제
apiVersion: batch/v1
kind: Job
metadata:
  name: temp-job
spec:
  ttlSecondsAfterFinished: 60
  template:
    spec:
      containers:
      - name: job
        image: job:1.0
        env:
        - name: TEMP_TOKEN
          valueFrom:
            secretKeyRef:
              name: temp-secret
              key: token
```

---

> 🚀 **다음 문서**: [resource-limits.md](resource-limits.md)에서 리소스 제한과 관리 방법을 알아보세요!