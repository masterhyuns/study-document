# 🛠️ kubectl 고급 활용 가이드

> 💡 **목표**: kubectl의 숨겨진 기능과 생산성을 극대화하는 팁을 마스터합니다.

## 📚 목차

1. [**기본 설정 최적화**](#기본-설정-최적화)
2. [**고급 조회 명령**](#고급-조회-명령)
3. [**리소스 관리 팁**](#리소스-관리-팁)
4. [**디버깅 마스터**](#디버깅-마스터)
5. [**생산성 향상 도구**](#생산성-향상-도구)
6. [**스크립팅과 자동화**](#스크립팅과-자동화)
7. [**플러그인 활용**](#플러그인-활용)

---

## ⚙️ 기본 설정 최적화

### 1. 별칭(Alias) 설정

```bash
# ~/.bashrc 또는 ~/.zshrc에 추가

# 기본 별칭
alias k=kubectl
alias kaf='kubectl apply -f'
alias kgp='kubectl get pods'
alias kgs='kubectl get svc'
alias kgd='kubectl get deployment'
alias kgn='kubectl get nodes'
alias kd='kubectl describe'
alias kdp='kubectl describe pod'
alias kdd='kubectl describe deployment'
alias krm='kubectl delete'
alias klo='kubectl logs'
alias klof='kubectl logs -f'
alias kex='kubectl exec -it'

# 네임스페이스별 별칭
alias kgpa='kubectl get pods --all-namespaces'
alias kgsys='kubectl --namespace=kube-system'
alias kprod='kubectl --namespace=production'
alias kdev='kubectl --namespace=development'

# Watch 모드
alias kwatch='kubectl get pods --watch'
alias kwatchall='kubectl get pods --all-namespaces --watch'

# 빠른 실행
alias krun='kubectl run test --rm -it --image=busybox -- sh'
alias kdebug='kubectl run debug --rm -it --image=nicolaka/netshoot -- bash'

# YAML 출력
alias kyaml='kubectl get -o yaml'
alias kjson='kubectl get -o json'

# 적용
source ~/.bashrc  # 또는 source ~/.zshrc
```

### 2. 자동완성 설정

```bash
# Bash
source <(kubectl completion bash)
echo "source <(kubectl completion bash)" >> ~/.bashrc

# Zsh
source <(kubectl completion zsh)
echo "source <(kubectl completion zsh)" >> ~/.zshrc

# Oh My Zsh
plugins=(kubectl)

# Fish
kubectl completion fish | source
```

### 3. Context와 Namespace 관리

```bash
# Context 목록
kubectl config get-contexts

# Context 전환
kubectl config use-context production

# 현재 Context 확인
kubectl config current-context

# Namespace 설정
kubectl config set-context --current --namespace=production

# Context 생성
kubectl config set-context dev \
  --cluster=dev-cluster \
  --user=dev-user \
  --namespace=development
```

### 4. kubeconfig 관리

```bash
# 여러 kubeconfig 병합
export KUBECONFIG=~/.kube/config:~/.kube/config-dev:~/.kube/config-prod

# 병합된 설정 저장
kubectl config view --flatten > ~/.kube/config-merged

# 환경별 kubeconfig
export KUBECONFIG_DEV=~/.kube/config-dev
export KUBECONFIG_PROD=~/.kube/config-prod

# 빠른 전환 함수
kdev() { export KUBECONFIG=$KUBECONFIG_DEV; }
kprod() { export KUBECONFIG=$KUBECONFIG_PROD; }
```

---

## 🔍 고급 조회 명령

### 1. 커스텀 컬럼

```bash
# Pod IP와 Node 표시
kubectl get pods -o custom-columns=NAME:.metadata.name,IP:.status.podIP,NODE:.spec.nodeName

# 모든 이미지 목록
kubectl get pods -A -o custom-columns='NAMESPACE:.metadata.namespace,POD:.metadata.name,IMAGE:.spec.containers[*].image'

# 리소스 사용량
kubectl get pods -o custom-columns=\
"NAME:.metadata.name,\
CPU_REQ:.spec.containers[*].resources.requests.cpu,\
MEM_REQ:.spec.containers[*].resources.requests.memory,\
CPU_LIM:.spec.containers[*].resources.limits.cpu,\
MEM_LIM:.spec.containers[*].resources.limits.memory"

# 커스텀 컬럼 파일 사용
cat <<EOF > pod-columns.txt
NAME          metadata.name
NAMESPACE     metadata.namespace
IP            status.podIP
NODE          spec.nodeName
STATUS        status.phase
RESTARTS      status.containerStatuses[0].restartCount
AGE           metadata.creationTimestamp
EOF

kubectl get pods -o custom-columns-file=pod-columns.txt
```

### 2. JSONPath 활용

```bash
# 모든 Pod의 이름
kubectl get pods -o jsonpath='{.items[*].metadata.name}'

# 조건부 필터링
kubectl get nodes -o jsonpath='{.items[?(@.status.conditions[?(@.type=="Ready")].status=="True")].metadata.name}'

# 복잡한 쿼리
kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.phase}{"\t"}{.spec.nodeName}{"\n"}{end}'

# Secret 값 추출
kubectl get secret my-secret -o jsonpath='{.data.password}' | base64 -d

# ConfigMap 데이터
kubectl get cm my-config -o jsonpath='{.data.application\.properties}'
```

### 3. 필터링과 정렬

```bash
# Label selector
kubectl get pods -l app=nginx,env=prod

# Field selector
kubectl get pods --field-selector status.phase=Running
kubectl get pods --field-selector metadata.name=my-pod
kubectl get events --field-selector involvedObject.kind=Pod

# 정렬
kubectl get pods --sort-by=.metadata.creationTimestamp
kubectl get pods --sort-by='{.status.containerStatuses[0].restartCount}'
kubectl get pv --sort-by=.spec.capacity.storage

# 복합 필터
kubectl get pods \
  -l 'environment in (production, staging)' \
  --field-selector status.phase=Running \
  --sort-by=.metadata.creationTimestamp
```

### 4. Wide 출력과 상세 정보

```bash
# Wide 출력
kubectl get pods -o wide
kubectl get nodes -o wide
kubectl get svc -o wide

# 모든 리소스 보기
kubectl get all
kubectl get all -A
kubectl get all,cm,secret,ing -A

# 특정 API 리소스
kubectl api-resources
kubectl api-resources --namespaced=true
kubectl api-resources --verbs=list,get
```

---

## 📦 리소스 관리 팁

### 1. Dry Run

```bash
# Client-side dry run
kubectl apply -f deployment.yaml --dry-run=client

# Server-side dry run
kubectl apply -f deployment.yaml --dry-run=server

# YAML 생성
kubectl create deployment nginx --image=nginx --dry-run=client -o yaml > deployment.yaml

# Secret 생성 (실제로 생성하지 않음)
kubectl create secret generic my-secret \
  --from-literal=password=secretpass \
  --dry-run=client -o yaml
```

### 2. Diff 비교

```bash
# 변경사항 미리보기
kubectl diff -f deployment.yaml

# 전체 디렉토리 diff
kubectl diff -R -f ./k8s/

# kustomize diff
kubectl diff -k ./overlays/production/
```

### 3. 일괄 작업

```bash
# 여러 파일 적용
kubectl apply -f deployment.yaml -f service.yaml
kubectl apply -R -f ./k8s/

# Label 일괄 추가
kubectl label pods --all env=dev
kubectl label pods -l app=nginx version=v1

# Annotation 추가
kubectl annotate pods --all description='Production pods'

# Scale 여러 Deployment
kubectl scale --replicas=3 deployment/app1 deployment/app2 deployment/app3

# 일괄 삭제
kubectl delete pods -l app=test
kubectl delete all -l env=dev
```

### 4. Patch 작업

```bash
# Strategic merge patch
kubectl patch deployment nginx -p '{"spec":{"replicas":5}}'

# JSON patch
kubectl patch deployment nginx --type='json' \
  -p='[{"op": "replace", "path": "/spec/replicas", "value":5}]'

# Patch from file
cat <<EOF > patch.yaml
spec:
  template:
    spec:
      containers:
      - name: nginx
        image: nginx:1.21
EOF
kubectl patch deployment nginx --patch-file=patch.yaml

# 조건부 patch
kubectl patch deployment nginx -p '{"spec":{"replicas":5}}' --record
```

---

## 🐛 디버깅 마스터

### 1. Logs 고급 활용

```bash
# 이전 컨테이너 로그
kubectl logs my-pod --previous

# 특정 컨테이너
kubectl logs my-pod -c nginx

# Label selector로 여러 Pod 로그
kubectl logs -l app=nginx --prefix=true

# 시간 기반 필터
kubectl logs my-pod --since=1h
kubectl logs my-pod --since-time=2024-01-01T00:00:00Z

# Tail 로그
kubectl logs my-pod --tail=100
kubectl logs -f my-pod --tail=50

# 모든 컨테이너 로그
kubectl logs my-pod --all-containers=true

# 타임스탬프 표시
kubectl logs my-pod --timestamps=true
```

### 2. Debug 컨테이너

```bash
# Ephemeral container 추가 (1.25+)
kubectl debug my-pod -it --image=busybox

# 기존 Pod 복사해서 디버깅
kubectl debug my-pod -it --copy-to=my-pod-debug --container=debug-container -- sh

# Node 디버깅
kubectl debug node/my-node -it --image=busybox

# 프로세스 네임스페이스 공유
kubectl debug my-pod -it --image=nicolaka/netshoot --target=nginx --share-processes
```

### 3. Port Forward

```bash
# 단일 포트
kubectl port-forward pod/my-pod 8080:80

# 여러 포트
kubectl port-forward pod/my-pod 8080:80 8443:443

# Service로 포워딩
kubectl port-forward service/my-service 8080:80

# Deployment로 포워딩
kubectl port-forward deployment/my-deployment 8080:80

# 랜덤 로컬 포트
kubectl port-forward pod/my-pod :80

# 모든 인터페이스에서 접근
kubectl port-forward --address 0.0.0.0 pod/my-pod 8080:80
```

### 4. Exec 고급 활용

```bash
# 명령 실행
kubectl exec my-pod -- ls -la /

# Interactive shell
kubectl exec -it my-pod -- bash

# 특정 컨테이너
kubectl exec -it my-pod -c nginx -- sh

# 환경변수 확인
kubectl exec my-pod -- env

# 파일 복사 (cp)
kubectl cp my-pod:/var/log/app.log ./app.log
kubectl cp ./config.yaml my-pod:/etc/config/

# 네트워크 테스트
kubectl exec my-pod -- curl -s http://another-service
kubectl exec my-pod -- nslookup kubernetes.default
```

### 5. Events와 Describe

```bash
# 전체 이벤트
kubectl get events --sort-by='.lastTimestamp'
kubectl get events --field-selector type=Warning

# 특정 리소스 이벤트
kubectl get events --field-selector involvedObject.name=my-pod
kubectl get events --field-selector involvedObject.kind=Node

# Watch 이벤트
kubectl get events --watch

# Describe 상세 정보
kubectl describe pod my-pod | grep -A 10 Events
kubectl describe node my-node | grep -A 5 Allocated
```

---

## 🚀 생산성 향상 도구

### 1. kubectl 프롬프트 (kube-ps1)

```bash
# 설치
brew install kube-ps1  # macOS
# 또는
git clone https://github.com/jonmosco/kube-ps1.git

# ~/.zshrc 설정
source "/usr/local/opt/kube-ps1/share/kube-ps1.sh"
PS1='$(kube_ps1)'$PS1

# 커스터마이징
KUBE_PS1_SYMBOL_ENABLE=true
KUBE_PS1_PREFIX='['
KUBE_PS1_SUFFIX=']'
KUBE_PS1_SEPARATOR='|'
```

### 2. kubectx & kubens

```bash
# 설치
brew install kubectx

# Context 전환
kubectx                    # 목록 보기
kubectx production         # production으로 전환
kubectx -                 # 이전 context로 전환

# Namespace 전환
kubens                     # 목록 보기
kubens production          # production namespace로 전환
kubens -                   # 이전 namespace로 전환
```

### 3. stern (멀티 Pod 로그)

```bash
# 설치
brew install stern

# 사용법
stern my-app               # my-app으로 시작하는 모든 Pod
stern my-app --tail 50     # 최근 50줄
stern my-app -t --since 1h # 1시간 이내 로그
stern -l app=nginx         # Label selector
stern .                    # 모든 Pod
```

### 4. k9s (터미널 UI)

```bash
# 설치
brew install k9s

# 실행
k9s

# 단축키
:pods       # Pod 보기
:svc        # Service 보기
:deploy     # Deployment 보기
/text       # 검색
d           # Describe
l           # Logs
e           # Edit
ctrl+d      # Delete
s           # Shell
p           # Port forward
```

### 5. fzf 통합

```bash
# fzf 설치
brew install fzf

# Pod 선택 함수
kpod() {
  kubectl get pods --no-headers | fzf | awk '{print $1}'
}

# 로그 보기
klogs() {
  kubectl logs $(kpod) $@
}

# Exec into pod
kexec() {
  kubectl exec -it $(kpod) -- ${1:-bash}
}

# Describe pod
kdesc() {
  kubectl describe pod $(kpod)
}

# Delete pod
kdel() {
  kubectl delete pod $(kpod)
}
```

---

## 📝 스크립팅과 자동화

### 1. Shell 스크립트

```bash
#!/bin/bash
# k8s-health-check.sh

# 모든 Pod 상태 체크
check_pods() {
  echo "Checking Pod status..."
  
  failed_pods=$(kubectl get pods -A --field-selector status.phase!=Running,status.phase!=Succeeded -o json | jq -r '.items[] | "\(.metadata.namespace)/\(.metadata.name): \(.status.phase)"')
  
  if [ -n "$failed_pods" ]; then
    echo "❌ Failed Pods:"
    echo "$failed_pods"
    return 1
  else
    echo "✅ All Pods are healthy"
    return 0
  fi
}

# Node 상태 체크
check_nodes() {
  echo "Checking Node status..."
  
  not_ready=$(kubectl get nodes -o json | jq -r '.items[] | select(.status.conditions[] | select(.type=="Ready" and .status!="True")) | .metadata.name')
  
  if [ -n "$not_ready" ]; then
    echo "❌ Not Ready Nodes:"
    echo "$not_ready"
    return 1
  else
    echo "✅ All Nodes are Ready"
    return 0
  fi
}

check_pods
check_nodes
```

### 2. Wait 명령

```bash
# Pod가 Ready될 때까지 대기
kubectl wait --for=condition=ready pod -l app=nginx --timeout=300s

# Deployment 완료 대기
kubectl wait --for=condition=available --timeout=600s deployment/my-app

# Job 완료 대기
kubectl wait --for=condition=complete job/my-job --timeout=300s

# 삭제 대기
kubectl delete pod my-pod
kubectl wait --for=delete pod/my-pod --timeout=60s
```

### 3. 반복 작업 자동화

```bash
# 모든 Deployment 재시작
for deploy in $(kubectl get deployments -o name); do
  kubectl rollout restart $deploy
done

# 모든 Failed Pod 삭제
kubectl delete pods --field-selector status.phase=Failed -A

# 이미지 업데이트
for deploy in $(kubectl get deployments -o name); do
  kubectl set image $deploy \*=nginx:1.21
done
```

### 4. 백업 스크립트

```bash
#!/bin/bash
# backup-k8s-resources.sh

BACKUP_DIR="k8s-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p $BACKUP_DIR

# 리소스 타입 목록
RESOURCES="deployments services configmaps secrets ingresses"

for resource in $RESOURCES; do
  echo "Backing up $resource..."
  kubectl get $resource -A -o yaml > "$BACKUP_DIR/$resource.yaml"
done

echo "Backup completed: $BACKUP_DIR"
tar -czf "$BACKUP_DIR.tar.gz" $BACKUP_DIR
rm -rf $BACKUP_DIR
```

---

## 🔌 플러그인 활용

### 1. Krew 설치

```bash
# Krew 설치
(
  set -x; cd "$(mktemp -d)" &&
  OS="$(uname | tr '[:upper:]' '[:lower:]')" &&
  ARCH="$(uname -m | sed -e 's/x86_64/amd64/' -e 's/\(arm\)\(64\)\?.*/\1\2/' -e 's/aarch64$/arm64/')" &&
  KREW="krew-${OS}_${ARCH}" &&
  curl -fsSLO "https://github.com/kubernetes-sigs/krew/releases/latest/download/${KREW}.tar.gz" &&
  tar zxvf "${KREW}.tar.gz" &&
  ./"${KREW}" install krew
)

# PATH 추가
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"
```

### 2. 유용한 플러그인

```bash
# 플러그인 목록
kubectl krew list
kubectl krew search

# 필수 플러그인 설치
kubectl krew install ctx        # Context 관리
kubectl krew install ns         # Namespace 관리
kubectl krew install tree       # 리소스 트리 보기
kubectl krew install neat       # YAML 정리
kubectl krew install images     # 이미지 목록
kubectl krew install who-can    # RBAC 권한 확인
kubectl krew install score      # Security 점수
kubectl krew install debug      # Debug 도구
kubectl krew install resource-capacity  # 리소스 사용량

# 사용 예시
kubectl ctx                    # Context 전환
kubectl ns                     # Namespace 전환
kubectl tree deployment my-app # 리소스 관계 트리
kubectl neat get pod my-pod -o yaml  # 깔끔한 YAML
kubectl images                 # 모든 이미지 목록
kubectl who-can create pods    # 권한 확인
```

### 3. 커스텀 플러그인 만들기

```bash
# kubectl-hello 플러그인
cat <<'EOF' > /usr/local/bin/kubectl-hello
#!/bin/bash
echo "Hello from kubectl plugin!"
echo "Current context: $(kubectl config current-context)"
echo "Current namespace: $(kubectl config view --minify -o jsonpath='{..namespace}')"
EOF

chmod +x /usr/local/bin/kubectl-hello

# 사용
kubectl hello
```

---

## 💡 Pro Tips

### 1. 빠른 테스트 Pod

```bash
# BusyBox
kubectl run test --rm -it --image=busybox -- sh

# Alpine with curl
kubectl run test --rm -it --image=alpine/curl -- sh

# Network 디버깅
kubectl run test --rm -it --image=nicolaka/netshoot -- bash

# MySQL 클라이언트
kubectl run mysql-client --rm -it --image=mysql:8 -- mysql -h mysql-service -p
```

### 2. 리소스 사용량 모니터링

```bash
# Node 리소스
kubectl top nodes
kubectl top nodes --sort-by=cpu
kubectl top nodes --sort-by=memory

# Pod 리소스
kubectl top pods
kubectl top pods -A --sort-by=cpu
kubectl top pods -A --sort-by=memory

# Container별 리소스
kubectl top pods --containers=true
```

### 3. YAML 템플릿

```bash
# Deployment 템플릿
kubectl create deployment my-app --image=nginx --dry-run=client -o yaml > deployment.yaml

# Service 템플릿
kubectl create service clusterip my-svc --tcp=80:8080 --dry-run=client -o yaml > service.yaml

# ConfigMap 템플릿
kubectl create configmap my-config --from-literal=key=value --dry-run=client -o yaml > configmap.yaml

# Secret 템플릿
kubectl create secret generic my-secret --from-literal=password=secret --dry-run=client -o yaml > secret.yaml
```

### 4. 유용한 함수 모음

```bash
# ~/.bashrc 또는 ~/.zshrc에 추가

# Pod 재시작
kres() {
  kubectl get pod $1 -o yaml | kubectl replace --force -f -
}

# 모든 리소스 보기
kall() {
  kubectl get all,cm,secret,ing,pvc,pv -A
}

# Pod IP 가져오기
kip() {
  kubectl get pod $1 -o jsonpath='{.status.podIP}'
}

# 이미지 버전 확인
kimg() {
  kubectl get deployment $1 -o jsonpath='{.spec.template.spec.containers[0].image}'
}

# CPU/Memory 사용량 Top 10
ktop() {
  kubectl top pods -A --sort-by=$1 | head -11
}

# 최근 이벤트
kevents() {
  kubectl get events --sort-by='.lastTimestamp' | tail -20
}
```

---

## 📊 Cheat Sheet

```bash
# 자주 사용하는 명령어 모음

# 빠른 조회
k get po -A                          # 모든 Pod
k get po -w                          # Watch mode
k get po -o wide                     # Wide 출력
k get all -n production              # 특정 namespace의 모든 리소스

# 리소스 생성/삭제
k run nginx --image=nginx            # Pod 생성
k create deploy nginx --image=nginx  # Deployment 생성
k expose deploy nginx --port=80      # Service 생성
k delete po --all                    # 모든 Pod 삭제

# 디버깅
k logs -f pod-name                   # 로그 추적
k exec -it pod-name -- bash          # Shell 접속
k describe po pod-name               # 상세 정보
k port-forward pod-name 8080:80      # 포트 포워딩

# 편집/업데이트
k edit deploy nginx                  # 에디터로 편집
k set image deploy/nginx nginx=nginx:1.21  # 이미지 업데이트
k scale deploy nginx --replicas=5    # 스케일링
k rollout status deploy nginx        # 롤아웃 상태
k rollout undo deploy nginx          # 롤백

# Label/Annotation
k label po nginx env=prod            # Label 추가
k annotate po nginx desc="web server"  # Annotation 추가

# 권한 확인
k auth can-i create pods             # 권한 확인
k auth can-i --list                  # 모든 권한 목록
```

---

> 🚀 kubectl을 마스터하면 Kubernetes 운영이 훨씬 쉬워집니다!