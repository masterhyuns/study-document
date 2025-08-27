# 🚀 첫 Kubernetes 애플리케이션 배포하기

> 💡 **목표**: 실제로 애플리케이션을 배포하며 Kubernetes의 핵심 워크플로우를 체험합니다.

## 📚 목차

1. [**시작하기 전에**](#시작하기-전에)
2. [**첫 번째 Pod 배포**](#첫-번째-pod-배포)
3. [**Deployment로 업그레이드**](#deployment로-업그레이드)
4. [**Service로 노출하기**](#service로-노출하기)
5. [**스케일링과 업데이트**](#스케일링과-업데이트)
6. [**실전 프로젝트: Todo 앱 배포**](#실전-프로젝트-todo-앱-배포)

---

## 🎯 시작하기 전에

### 환경 확인

```bash
# 클러스터 연결 확인
kubectl cluster-info

# 노드 상태 확인
kubectl get nodes

# 현재 컨텍스트 확인
kubectl config current-context

# namespace 생성 (학습용)
kubectl create namespace learning
kubectl config set-context --current --namespace=learning
```

### 유용한 별칭 설정

```bash
# ~/.bashrc 또는 ~/.zshrc에 추가
alias k=kubectl
alias kgp='kubectl get pods'
alias kgs='kubectl get svc'
alias kgd='kubectl get deployment'
alias kaf='kubectl apply -f'
alias kdel='kubectl delete'
alias klog='kubectl logs'
alias kexec='kubectl exec -it'

# 적용
source ~/.bashrc  # 또는 source ~/.zshrc
```

---

## 🌱 첫 번째 Pod 배포

### Step 1: 명령어로 Pod 생성

```bash
# 가장 간단한 Pod 생성
kubectl run my-first-pod --image=nginx:alpine

# Pod 확인
kubectl get pods
kubectl describe pod my-first-pod

# Pod 내부 접속
kubectl exec -it my-first-pod -- sh
# 내부에서 확인
> curl localhost
> exit

# Pod 삭제
kubectl delete pod my-first-pod
```

### Step 2: YAML로 Pod 생성

```yaml
# first-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: web-pod
  labels:
    app: web
    environment: dev
spec:
  containers:
  - name: nginx
    image: nginx:alpine
    ports:
    - containerPort: 80
    env:
    - name: MESSAGE
      value: "Hello Kubernetes!"
```

```bash
# Pod 생성
kubectl apply -f first-pod.yaml

# 상태 확인
kubectl get pod web-pod
kubectl get pod web-pod -o yaml
kubectl get pod web-pod -o json | jq '.status'

# 로그 확인
kubectl logs web-pod

# 정리
kubectl delete -f first-pod.yaml
```

### 🔍 무슨 일이 일어났나?

```mermaid
sequenceDiagram
    participant User
    participant kubectl
    participant API
    participant Scheduler
    participant kubelet
    participant Container
    
    User->>kubectl: kubectl run my-pod
    kubectl->>API: Pod 생성 요청
    API->>API: Pod 객체 저장
    API->>Scheduler: 스케줄링 필요
    Scheduler->>API: Node 할당
    API->>kubelet: Pod 생성 지시
    kubelet->>Container: 컨테이너 시작
    Container-->>kubelet: Running
    kubelet-->>API: 상태 업데이트
    API-->>kubectl: 생성 완료
    kubectl-->>User: pod/my-pod created
```

---

## 🔄 Deployment로 업그레이드

### Pod vs Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-deployment
  labels:
    app: web
spec:
  replicas: 3  # 3개의 Pod 실행
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: nginx
        image: nginx:alpine
        ports:
        - containerPort: 80
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "100m"
```

```bash
# Deployment 생성
kubectl apply -f deployment.yaml

# 생성 과정 관찰
kubectl get deployment web-deployment --watch

# Pod 확인 (3개가 생성됨)
kubectl get pods -l app=web

# ReplicaSet 확인
kubectl get replicaset

# 전체 리소스 확인
kubectl get all -l app=web
```

### 실험: Pod 삭제해보기

```bash
# Pod 하나 삭제
kubectl delete pod <pod-name>

# 즉시 새로운 Pod가 생성되는 것 확인
kubectl get pods -l app=web --watch

# Deployment가 항상 3개를 유지함
```

---

## 🌐 Service로 노출하기

### Service 생성

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: web-service
spec:
  selector:
    app: web  # Deployment의 Pod 선택
  ports:
  - port: 80
    targetPort: 80
  type: ClusterIP  # 클러스터 내부 접근
```

```bash
# Service 생성
kubectl apply -f service.yaml

# Service 확인
kubectl get service web-service
kubectl describe service web-service

# Endpoints 확인 (실제 Pod IP들)
kubectl get endpoints web-service
```

### Service 테스트

```bash
# 방법 1: 임시 Pod에서 테스트
kubectl run test-pod --rm -it --image=busybox -- sh
# Pod 내부에서
> wget -O- web-service
> exit

# 방법 2: Port Forward
kubectl port-forward service/web-service 8080:80
# 다른 터미널에서
curl localhost:8080

# 방법 3: NodePort로 변경
kubectl patch service web-service -p '{"spec":{"type":"NodePort"}}'
kubectl get service web-service
# NodePort 확인 후 접속
```

---

## 📈 스케일링과 업데이트

### 수동 스케일링

```bash
# Scale up
kubectl scale deployment web-deployment --replicas=5

# 확인
kubectl get pods -l app=web

# Scale down
kubectl scale deployment web-deployment --replicas=2
```

### 자동 스케일링 (HPA)

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-deployment
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50
```

```bash
# HPA 생성
kubectl apply -f hpa.yaml

# 부하 테스트
kubectl run -it load-generator --rm --image=busybox -- sh
# 내부에서 부하 생성
> while true; do wget -q -O- http://web-service; done

# 다른 터미널에서 HPA 관찰
kubectl get hpa web-hpa --watch
```

### 애플리케이션 업데이트

```bash
# 이미지 업데이트
kubectl set image deployment/web-deployment nginx=nginx:1.21-alpine

# 롤아웃 상태 확인
kubectl rollout status deployment/web-deployment

# 업데이트 히스토리
kubectl rollout history deployment/web-deployment

# 롤백 (필요시)
kubectl rollout undo deployment/web-deployment
```

---

## 💼 실전 프로젝트: Todo 앱 배포

### 전체 아키텍처

```mermaid
graph TB
    subgraph "Kubernetes Cluster"
        I[Ingress] --> SF[Frontend Service]
        SF --> F1[Frontend Pod 1]
        SF --> F2[Frontend Pod 2]
        
        F1 --> SB[Backend Service]
        F2 --> SB
        SB --> B1[Backend Pod 1]
        SB --> B2[Backend Pod 2]
        
        B1 --> SD[Database Service]
        B2 --> SD
        SD --> D[Database Pod]
        D --> PV[Persistent Volume]
    end
    
    U[User] --> I
```

### 1. Database 배포

```yaml
# todo-db.yaml
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi

---
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
        image: postgres:13-alpine
        env:
        - name: POSTGRES_DB
          value: tododb
        - name: POSTGRES_USER
          value: todouser
        - name: POSTGRES_PASSWORD
          value: todopass123
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
          subPath: postgres
      volumes:
      - name: postgres-storage
        persistentVolumeClaim:
          claimName: postgres-pvc

---
apiVersion: v1
kind: Service
metadata:
  name: postgres
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
  clusterIP: None  # Headless service
```

### 2. Backend API 배포

```yaml
# todo-backend.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: todo-backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: todo-backend
  template:
    metadata:
      labels:
        app: todo-backend
    spec:
      containers:
      - name: backend
        image: node:14-alpine
        command: ["/bin/sh"]
        args: 
        - -c
        - |
          cat <<'EOF' > server.js
          const express = require('express');
          const app = express();
          const PORT = 3000;
          
          app.use(express.json());
          
          let todos = [
            { id: 1, title: 'Learn Kubernetes', done: false },
            { id: 2, title: 'Deploy Application', done: false }
          ];
          
          app.get('/api/todos', (req, res) => {
            res.json(todos);
          });
          
          app.post('/api/todos', (req, res) => {
            const todo = {
              id: todos.length + 1,
              title: req.body.title,
              done: false
            };
            todos.push(todo);
            res.status(201).json(todo);
          });
          
          app.put('/api/todos/:id', (req, res) => {
            const todo = todos.find(t => t.id === parseInt(req.params.id));
            if (todo) {
              todo.done = !todo.done;
              res.json(todo);
            } else {
              res.status(404).json({ error: 'Todo not found' });
            }
          });
          
          app.get('/health', (req, res) => {
            res.json({ status: 'healthy' });
          });
          
          app.listen(PORT, () => {
            console.log('Server running on port ' + PORT);
          });
          EOF
          
          npm install express
          node server.js
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          value: "postgres://todouser:todopass123@postgres:5432/tododb"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: todo-backend
spec:
  selector:
    app: todo-backend
  ports:
  - port: 3000
```

### 3. Frontend 배포

```yaml
# todo-frontend.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: todo-frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: todo-frontend
  template:
    metadata:
      labels:
        app: todo-frontend
    spec:
      containers:
      - name: frontend
        image: nginx:alpine
        ports:
        - containerPort: 80
        volumeMounts:
        - name: html
          mountPath: /usr/share/nginx/html
      initContainers:
      - name: html-generator
        image: busybox
        command: ['sh', '-c']
        args:
        - |
          cat <<'EOF' > /html/index.html
          <!DOCTYPE html>
          <html>
          <head>
              <title>Todo App</title>
              <style>
                  body { font-family: Arial; max-width: 600px; margin: 50px auto; }
                  h1 { color: #333; }
                  input { padding: 10px; width: 300px; }
                  button { padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer; }
                  ul { list-style: none; padding: 0; }
                  li { padding: 10px; margin: 5px 0; background: #f4f4f4; display: flex; justify-content: space-between; }
                  .done { text-decoration: line-through; opacity: 0.6; }
              </style>
          </head>
          <body>
              <h1>🚀 Kubernetes Todo App</h1>
              <div>
                  <input type="text" id="todoInput" placeholder="What needs to be done?">
                  <button onclick="addTodo()">Add</button>
              </div>
              <ul id="todoList"></ul>
              
              <script>
                  const API_URL = '/api';
                  
                  async function loadTodos() {
                      try {
                          const response = await fetch(API_URL + '/todos');
                          const todos = await response.json();
                          const list = document.getElementById('todoList');
                          list.innerHTML = '';
                          todos.forEach(todo => {
                              const li = document.createElement('li');
                              li.className = todo.done ? 'done' : '';
                              li.innerHTML = `
                                  <span>${todo.title}</span>
                                  <button onclick="toggleTodo(${todo.id})">${todo.done ? 'Undo' : 'Done'}</button>
                              `;
                              list.appendChild(li);
                          });
                      } catch (error) {
                          console.error('Error loading todos:', error);
                      }
                  }
                  
                  async function addTodo() {
                      const input = document.getElementById('todoInput');
                      if (input.value.trim()) {
                          await fetch(API_URL + '/todos', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ title: input.value })
                          });
                          input.value = '';
                          loadTodos();
                      }
                  }
                  
                  async function toggleTodo(id) {
                      await fetch(API_URL + '/todos/' + id, { method: 'PUT' });
                      loadTodos();
                  }
                  
                  loadTodos();
                  setInterval(loadTodos, 5000);
              </script>
          </body>
          </html>
          EOF
        volumeMounts:
        - name: html
          mountPath: /html
      volumes:
      - name: html
        emptyDir: {}

---
apiVersion: v1
kind: Service
metadata:
  name: todo-frontend
spec:
  selector:
    app: todo-frontend
  ports:
  - port: 80
  type: NodePort
```

### 4. Ingress 설정

```yaml
# todo-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: todo-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$1
spec:
  rules:
  - http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: todo-frontend
            port:
              number: 80
      - path: /api/(.*)
        pathType: Prefix
        backend:
          service:
            name: todo-backend
            port:
              number: 3000
```

### 5. 전체 배포

```bash
# 모든 리소스 배포
kubectl apply -f todo-db.yaml
kubectl apply -f todo-backend.yaml
kubectl apply -f todo-frontend.yaml
kubectl apply -f todo-ingress.yaml

# 상태 확인
kubectl get all
kubectl get ingress

# 접속 테스트 (NodePort 사용)
kubectl get svc todo-frontend
# NodePort 번호 확인 후 브라우저에서 접속

# 또는 Port Forward
kubectl port-forward svc/todo-frontend 8080:80
# http://localhost:8080 접속

# 로그 모니터링
kubectl logs -f -l app=todo-backend
```

---

## 🎓 학습 포인트

### 이 실습으로 배운 것들

✅ **Pod 생명주기**: 생성, 실행, 삭제 과정  
✅ **Deployment의 이점**: 자동 복구, 롤링 업데이트  
✅ **Service의 역할**: 안정적인 네트워크 엔드포인트  
✅ **스케일링**: 수동/자동으로 부하 대응  
✅ **애플리케이션 업데이트**: 무중단 배포  
✅ **멀티 티어 애플리케이션**: Frontend-Backend-Database 구성  

### 다음 단계

1. **ConfigMap/Secret 활용**: 설정과 민감 정보 관리
2. **Persistent Volume**: 데이터 영구 저장
3. **Health Check**: Liveness/Readiness Probe 설정
4. **Resource Management**: CPU/Memory 제한 설정
5. **Monitoring**: Prometheus/Grafana 연동

---

## 🔧 트러블슈팅

### Pod가 Pending 상태일 때

```bash
# 상세 정보 확인
kubectl describe pod <pod-name>

# 일반적인 원인:
# 1. 리소스 부족: Node에 CPU/Memory 부족
# 2. 이미지 문제: ImagePullBackOff
# 3. Volume 문제: PVC가 Bound되지 않음

# Node 리소스 확인
kubectl top nodes
kubectl describe node <node-name>
```

### Service에 연결되지 않을 때

```bash
# Endpoints 확인
kubectl get endpoints <service-name>

# Pod selector 확인
kubectl get pods --show-labels
kubectl get svc <service-name> -o yaml | grep selector -A 5

# DNS 테스트
kubectl run test --rm -it --image=busybox -- nslookup <service-name>
```

### 애플리케이션이 재시작될 때

```bash
# Pod 이벤트 확인
kubectl describe pod <pod-name>

# 로그 확인 (이전 컨테이너)
kubectl logs <pod-name> --previous

# 리소스 사용량 확인
kubectl top pod <pod-name>
```

---

## 💡 베스트 프랙티스

### 1. 항상 리소스 제한 설정
```yaml
resources:
  requests:
    memory: "64Mi"
    cpu: "50m"
  limits:
    memory: "128Mi"
    cpu: "100m"
```

### 2. Health Check 구현
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 30
readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 5
```

### 3. 레이블 전략
```yaml
labels:
  app: myapp
  version: v1.0.0
  environment: production
  team: backend
```

---

> 🚀 **축하합니다!** 첫 Kubernetes 애플리케이션을 성공적으로 배포했습니다!  
> 📚 **다음 문서**: [../02-workloads/pods.md](../02-workloads/pods.md)에서 Pod를 더 깊이 이해해보세요!