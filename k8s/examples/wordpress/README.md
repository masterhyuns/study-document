# 🌐 WordPress on Kubernetes 실전 배포

> 프로덕션 준비된 WordPress + MySQL 풀스택 애플리케이션 배포 가이드

## 📋 구성 요소

- **WordPress**: 3개 replica, HPA 자동 스케일링
- **MySQL**: 단일 인스턴스, 영구 스토리지
- **Ingress**: HTTPS 지원, Let's Encrypt 인증서
- **Storage**: PersistentVolume으로 데이터 영구 저장
- **Security**: NetworkPolicy, Secret 관리

## 🚀 배포 방법

### 1. Namespace 생성
```bash
kubectl create namespace wordpress
```

### 2. 배포
```bash
kubectl apply -f deploy.yaml
```

### 3. 상태 확인
```bash
# Pod 상태
kubectl get pods -n wordpress

# Service 확인
kubectl get svc -n wordpress

# Ingress 확인
kubectl get ingress -n wordpress

# PVC 확인
kubectl get pvc -n wordpress
```

### 4. 접속
```bash
# Ingress 주소 확인
kubectl get ingress -n wordpress

# 또는 Port Forward로 테스트
kubectl port-forward -n wordpress svc/wordpress 8080:80
# 브라우저에서 http://localhost:8080 접속
```

## 📝 커스터마이징

### 도메인 변경
```yaml
# deploy.yaml에서 wordpress.example.com을 실제 도메인으로 변경
spec:
  rules:
  - host: your-domain.com
```

### 리소스 조정
```yaml
resources:
  requests:
    memory: "512Mi"  # 최소 메모리
    cpu: "500m"      # 최소 CPU
  limits:
    memory: "1Gi"    # 최대 메모리
    cpu: "1"         # 최대 CPU
```

### 스토리지 크기 변경
```yaml
resources:
  requests:
    storage: 50Gi  # 원하는 크기로 변경
```

## 🔒 보안 설정

### Secret 생성
```bash
# MySQL 비밀번호 변경
echo -n 'your-strong-password' | base64
# 결과를 deploy.yaml의 Secret 섹션에 적용
```

### SSL/TLS 설정
```bash
# cert-manager 설치 (사전 요구사항)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# ClusterIssuer 생성
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

## 📊 모니터링

### 로그 확인
```bash
# WordPress 로그
kubectl logs -n wordpress -l app=wordpress --tail=100

# MySQL 로그
kubectl logs -n wordpress -l app=mysql --tail=100
```

### 메트릭 확인
```bash
# HPA 상태
kubectl get hpa -n wordpress

# 리소스 사용량
kubectl top pods -n wordpress
```

## 🔧 트러블슈팅

### WordPress가 MySQL에 연결되지 않음
```bash
# MySQL 서비스 확인
kubectl get svc mysql -n wordpress

# MySQL Pod 상태 확인
kubectl describe pod -n wordpress -l app=mysql

# 연결 테스트
kubectl run -it --rm debug --image=mysql:8.0 --restart=Never -n wordpress -- mysql -h mysql -u wordpress -p
```

### 스토리지 문제
```bash
# PVC 상태 확인
kubectl describe pvc -n wordpress

# StorageClass 확인
kubectl get storageclass
```

### 성능 이슈
```bash
# HPA 스케일링 확인
kubectl describe hpa wordpress-hpa -n wordpress

# Pod 리소스 사용량 확인
kubectl top pods -n wordpress
```

## 🧹 정리

```bash
# 전체 삭제
kubectl delete namespace wordpress

# 또는 개별 삭제
kubectl delete -f deploy.yaml
```

## 💡 프로덕션 체크리스트

- [ ] 강력한 비밀번호 설정
- [ ] 백업 전략 수립
- [ ] 모니터링 설정 (Prometheus/Grafana)
- [ ] 로깅 설정 (EFK Stack)
- [ ] 리소스 limits 적절히 설정
- [ ] NetworkPolicy 구성
- [ ] 정기 보안 업데이트
- [ ] 데이터베이스 레플리케이션 고려