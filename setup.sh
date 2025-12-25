#!/bin/bash
# ============================================
# B2Automate One-Click Setup Script
# ============================================
# Target: Oracle Cloud Always Free Ubuntu VM
# RAM: 1 GB | CPU: 1 OCPU
# 
# Usage: bash setup.sh
# ============================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================
# Helper Functions
# ============================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# ============================================
# Pre-flight Checks
# ============================================

log_info "============================================"
log_info " B2Automate Production Setup"
log_info " Oracle Cloud Always Free VM"
log_info "============================================"

# Check if running as non-root (but with sudo access)
if [ "$EUID" -eq 0 ]; then
    log_error "Do not run this script as root. Run as regular user with sudo access."
fi

# Check sudo access
if ! sudo -v; then
    log_error "User needs sudo access to run this script."
fi

# Check Ubuntu version
if [ -f /etc/os-release ]; then
    . /etc/os-release
    if [[ "$ID" != "ubuntu" ]]; then
        log_error "This script is designed for Ubuntu. Detected: $ID"
    fi
    log_info "Ubuntu version: $VERSION_ID"
else
    log_error "Cannot detect OS version."
fi

# Check RAM (minimum 900 MB)
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_RAM_MB=$((TOTAL_RAM_KB / 1024))
if [ "$TOTAL_RAM_MB" -lt 900 ]; then
    log_error "Insufficient RAM. Required: 900 MB, Available: ${TOTAL_RAM_MB} MB"
fi
log_info "RAM available: ${TOTAL_RAM_MB} MB"

# Check if .env exists
if [ ! -f ".env" ]; then
    log_error ".env file not found. Please copy .env.example to .env and configure it first."
fi
log_success ".env file found"

# Validate required environment variables
log_info "Validating required environment variables..."
source .env

if [ -z "$DATABASE_URL" ]; then
    log_error "DATABASE_URL is not set in .env"
fi

if [ -z "$JWT_SECRET" ]; then
    log_error "JWT_SECRET is not set in .env"
fi

if [ ${#JWT_SECRET} -lt 32 ]; then
    log_error "JWT_SECRET must be at least 32 characters long"
fi

log_success "Environment variables validated"

# ============================================
# Install Docker
# ============================================

if ! command -v docker &> /dev/null; then
    log_info "Installing Docker..."
    
    # Update package index
    sudo apt-get update -y
    
    # Install prerequisites
    sudo apt-get install -y ca-certificates curl gnupg lsb-release
    
    # Add Docker GPG key
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    # Add Docker repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Add current user to docker group
    sudo usermod -aG docker $USER
    
    log_success "Docker installed successfully"
    log_warn "You may need to log out and back in for docker group to take effect."
else
    log_success "Docker is already installed"
fi

# Ensure Docker is running
sudo systemctl enable docker
sudo systemctl start docker

# ============================================
# Install Node.js (for frontend builds)
# ============================================

if ! command -v node &> /dev/null; then
    log_info "Installing Node.js 20 LTS..."
    
    # Install Node.js via NodeSource
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    log_success "Node.js installed: $(node --version)"
else
    log_success "Node.js is already installed: $(node --version)"
fi

# ============================================
# Create Required Directories
# ============================================

log_info "Creating directories..."

mkdir -p apps/web/dist
mkdir -p apps/admin/dist
mkdir -p ssl
mkdir -p logs

log_success "Directories created"

# ============================================
# Install Dependencies
# ============================================

log_info "Installing npm dependencies..."
npm ci

log_success "Dependencies installed"

# ============================================
# Build Frontend Applications
# ============================================

log_info "Building frontend applications..."

# Set production API URL (uses relative /api path which nginx proxies)
export VITE_API_URL=""

# Build web frontend
log_info "Building apps/web..."
npm run build --workspace=apps/web

# Build admin frontend
log_info "Building apps/admin..."
npm run build --workspace=apps/admin

log_success "Frontend applications built"

# ============================================
# Build Docker Images
# ============================================

log_info "Building Docker images (this may take a few minutes)..."

# Enable BuildKit for faster builds
export DOCKER_BUILDKIT=1

# Build API image
log_info "Building API image..."
sudo docker build -f Dockerfile.api -t b2automate-api:latest .

# Build Worker image
log_info "Building Worker image..."
sudo docker build -f Dockerfile.worker -t b2automate-worker:latest .

log_success "Docker images built"

# ============================================
# Configure Firewall
# ============================================

log_info "Configuring firewall..."

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP
sudo ufw allow 80/tcp

# Allow HTTPS
sudo ufw allow 443/tcp

# Enable firewall (if not already)
echo "y" | sudo ufw enable || true

log_success "Firewall configured"

# ============================================
# Start Services
# ============================================

log_info "Starting Docker Compose services..."

# Stop any existing containers
sudo docker compose down --remove-orphans 2>/dev/null || true

# Start all services
sudo docker compose up -d

log_success "Services started"

# ============================================
# Wait for Health Checks
# ============================================

log_info "Waiting for services to be healthy..."

# Wait for API to be healthy (max 60 seconds)
MAX_WAIT=60
WAIT_COUNT=0

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if curl -s http://localhost/health > /dev/null 2>&1; then
        log_success "API is healthy!"
        break
    fi
    sleep 2
    WAIT_COUNT=$((WAIT_COUNT + 2))
    echo -n "."
done

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
    log_warn "API health check timed out. Check logs: sudo docker compose logs api"
fi

# ============================================
# Print Status
# ============================================

log_info "============================================"
log_success " B2Automate Deployment Complete!"
log_info "============================================"

echo ""
echo "Services Status:"
sudo docker compose ps
echo ""

echo "Memory Usage:"
sudo docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"
echo ""

# Get public IP
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "your-server-ip")

echo -e "${GREEN}Access URLs:${NC}"
echo -e "  Web Frontend: http://${PUBLIC_IP}/"
echo -e "  Admin Panel:  http://${PUBLIC_IP}/admin"
echo -e "  API Health:   http://${PUBLIC_IP}/health"
echo ""

echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Configure your domain DNS to point to: ${PUBLIC_IP}"
echo "  2. Set up SSL with: sudo certbot --nginx -d your-domain.com"
echo "  3. Run Prisma migrations: sudo docker compose exec api npx prisma migrate deploy"
echo ""

log_info "Logs: sudo docker compose logs -f"
log_info "Stop: sudo docker compose down"
log_info "Restart: sudo docker compose restart"
