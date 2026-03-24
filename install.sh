#!/usr/bin/env bash
set -e

# MSF Installer
# curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/msf/main/install.sh | bash

REPO="YOUR_USERNAME/msf"
INSTALL_DIR="$HOME/.msf"
BIN_DIR="$HOME/.local/bin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${CYAN}${BOLD}"
echo "  ███╗   ███╗███████╗███████╗"
echo "  ████╗ ████║██╔════╝██╔════╝"
echo "  ██╔████╔██║███████╗█████╗  "
echo "  ██║╚██╔╝██║╚════██║██╔══╝  "
echo "  ██║ ╚═╝ ██║███████║██║     "
echo "  ╚═╝     ╚═╝╚══════╝╚═╝     "
echo -e "${NC}"
echo -e "${BOLD}  My Smart Friend — AI Gateway${NC}"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js not found.${NC} Please install Node.js 18+ from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}✗ Node.js 18+ required.${NC} You have $(node -v). Please upgrade."
  exit 1
fi

echo -e "${GREEN}✓ Node.js $(node -v) detected${NC}"

# Create install directory
mkdir -p "$INSTALL_DIR"
mkdir -p "$BIN_DIR"

echo -e "${CYAN}→ Downloading MSF...${NC}"

# Download the latest release
if command -v curl &> /dev/null; then
  curl -fsSL "https://github.com/$REPO/archive/refs/heads/main.tar.gz" -o /tmp/msf.tar.gz
elif command -v wget &> /dev/null; then
  wget -qO /tmp/msf.tar.gz "https://github.com/$REPO/archive/refs/heads/main.tar.gz"
else
  echo -e "${RED}✗ curl or wget required.${NC}"
  exit 1
fi

tar -xzf /tmp/msf.tar.gz -C /tmp/
cp -r /tmp/msf-main/* "$INSTALL_DIR/"
rm -rf /tmp/msf.tar.gz /tmp/msf-main

echo -e "${CYAN}→ Installing dependencies...${NC}"
cd "$INSTALL_DIR"
npm install --silent

# Create the msf binary
cat > "$BIN_DIR/msf" << 'EOF'
#!/usr/bin/env bash
node "$HOME/.msf/bin/msf.js" "$@"
EOF
chmod +x "$BIN_DIR/msf"

# Add to PATH if needed
SHELL_CONFIG=""
if [[ "$SHELL" == *"zsh"* ]]; then
  SHELL_CONFIG="$HOME/.zshrc"
elif [[ "$SHELL" == *"bash"* ]]; then
  SHELL_CONFIG="$HOME/.bashrc"
fi

if [ -n "$SHELL_CONFIG" ] && ! grep -q "$BIN_DIR" "$SHELL_CONFIG" 2>/dev/null; then
  echo "" >> "$SHELL_CONFIG"
  echo "# MSF" >> "$SHELL_CONFIG"
  echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$SHELL_CONFIG"
  echo -e "${YELLOW}→ Added $BIN_DIR to PATH in $SHELL_CONFIG${NC}"
fi

echo ""
echo -e "${GREEN}${BOLD}✓ MSF installed successfully!${NC}"
echo ""
echo -e "  Run ${CYAN}${BOLD}msf setup${NC} to configure your GitHub Copilot connection."
echo -e "  Then just type ${CYAN}${BOLD}msf${NC} to launch the gateway."
echo ""

# Reload shell path
export PATH="$BIN_DIR:$PATH"

# Auto-run setup
echo -e "${YELLOW}Starting setup wizard...${NC}"
echo ""
msf setup
