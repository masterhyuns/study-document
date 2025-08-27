#!/bin/bash
# Elasticsearch Cluster Initialization Script
# ===========================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Elasticsearch Cluster Setup Script${NC}"
echo "======================================"

# Check Docker and Docker Compose installation
check_requirements() {
    echo -e "\n${YELLOW}Checking requirements...${NC}"
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker is not installed${NC}"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}❌ Docker Compose is not installed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ All requirements met${NC}"
}

# Set vm.max_map_count
set_vm_max_map_count() {
    echo -e "\n${YELLOW}Setting vm.max_map_count...${NC}"
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo sysctl -w vm.max_map_count=262144
        echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo -e "${YELLOW}ℹ️  macOS detected - vm.max_map_count is handled by Docker Desktop${NC}"
    fi
    
    echo -e "${GREEN}✅ System settings configured${NC}"
}

# Stop and clean existing containers
cleanup() {
    echo -e "\n${YELLOW}Cleaning up existing containers...${NC}"
    docker-compose down -v 2>/dev/null || true
    echo -e "${GREEN}✅ Cleanup complete${NC}"
}

# Start Elasticsearch cluster
start_cluster() {
    echo -e "\n${YELLOW}Starting Elasticsearch cluster...${NC}"
    docker-compose up -d
    
    echo -e "\n${YELLOW}Waiting for cluster to be ready...${NC}"
    
    # Wait for Elasticsearch to start
    for i in {1..30}; do
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:9200 | grep -q "200"; then
            echo -e "\n${GREEN}✅ Elasticsearch is ready!${NC}"
            break
        fi
        echo -n "."
        sleep 5
    done
    
    # Wait for Kibana to start
    echo -e "\n${YELLOW}Waiting for Kibana...${NC}"
    for i in {1..30}; do
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:5601/api/status | grep -q "200"; then
            echo -e "${GREEN}✅ Kibana is ready!${NC}"
            break
        fi
        echo -n "."
        sleep 5
    done
}

# Check cluster health
check_cluster_health() {
    echo -e "\n${YELLOW}Checking cluster health...${NC}"
    
    HEALTH=$(curl -s http://localhost:9200/_cluster/health | python3 -m json.tool)
    echo "$HEALTH"
    
    if echo "$HEALTH" | grep -q '"status" : "green"'; then
        echo -e "${GREEN}✅ Cluster is healthy (GREEN)${NC}"
    elif echo "$HEALTH" | grep -q '"status" : "yellow"'; then
        echo -e "${YELLOW}⚠️  Cluster is operational (YELLOW)${NC}"
    else
        echo -e "${RED}❌ Cluster is unhealthy (RED)${NC}"
    fi
}

# Create sample index
create_sample_data() {
    echo -e "\n${YELLOW}Creating sample index...${NC}"
    
    # Create products index
    curl -X PUT "localhost:9200/products" -H 'Content-Type: application/json' -d'
    {
      "settings": {
        "number_of_shards": 3,
        "number_of_replicas": 1
      },
      "mappings": {
        "properties": {
          "name": { "type": "text", "analyzer": "standard" },
          "name_ko": { "type": "text", "analyzer": "nori" },
          "description": { "type": "text" },
          "price": { "type": "float" },
          "category": { "type": "keyword" },
          "brand": { "type": "keyword" },
          "in_stock": { "type": "boolean" },
          "created_at": { "type": "date" }
        }
      }
    }' 2>/dev/null
    
    # Insert sample documents
    curl -X POST "localhost:9200/products/_doc" -H 'Content-Type: application/json' -d'
    {
      "name": "MacBook Pro 16-inch",
      "name_ko": "맥북 프로 16인치",
      "description": "High-performance laptop for professionals",
      "price": 3500000,
      "category": "laptop",
      "brand": "Apple",
      "in_stock": true,
      "created_at": "2024-01-15T10:00:00Z"
    }' 2>/dev/null
    
    curl -X POST "localhost:9200/products/_doc" -H 'Content-Type: application/json' -d'
    {
      "name": "Samsung Galaxy S24",
      "name_ko": "삼성 갤럭시 S24",
      "description": "Latest flagship smartphone",
      "price": 1200000,
      "category": "smartphone",
      "brand": "Samsung",
      "in_stock": true,
      "created_at": "2024-01-20T14:30:00Z"
    }' 2>/dev/null
    
    echo -e "\n${GREEN}✅ Sample data created${NC}"
}

# Display access information
display_info() {
    echo -e "\n${GREEN}🎉 Elasticsearch Cluster is Ready!${NC}"
    echo "======================================"
    echo -e "Elasticsearch: ${GREEN}http://localhost:9200${NC}"
    echo -e "Kibana:        ${GREEN}http://localhost:5601${NC}"
    echo -e "Cerebro:       ${GREEN}http://localhost:9000${NC}"
    echo -e "Head Plugin:   ${GREEN}http://localhost:9100${NC}"
    echo ""
    echo "Useful commands:"
    echo "  docker-compose logs -f es01    # View logs"
    echo "  docker-compose stop             # Stop cluster"
    echo "  docker-compose down             # Stop and remove"
    echo "  docker-compose down -v          # Stop, remove, and delete data"
    echo ""
    echo -e "${YELLOW}📝 Check Kibana Dev Tools for query console${NC}"
}

# Main execution
main() {
    check_requirements
    set_vm_max_map_count
    cleanup
    start_cluster
    check_cluster_health
    create_sample_data
    display_info
}

# Run if not sourced
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi