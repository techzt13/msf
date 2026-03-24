#!/usr/bin/env bash
set -e

# MSF Installer
# curl -fsSL https://raw.githubusercontent.com/techzt13/msf/main/install.sh | bash

REPO="techzt13/msf"
MSF_DATA_DIR="$HOME/.msf"           # user data: config, memory, token, soul
MSF_CODE_DIR="$HOME/.msf-app"       # code only: bin, gateway, node_modules
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

# Create directories
mkdir -p "$MSF_DATA_DIR"   # user data — never overwritten after first install
mkdir -p "$MSF_CODE_DIR"   # code — always replaced on update
mkdir -p "$BIN_DIR"

echo -e "${CYAN}→ Downloading MSF...${NC}"

if command -v curl &> /dev/null; then
  curl -fsSL "https://github.com/$REPO/archive/refs/heads/main.tar.gz" -o /tmp/msf.tar.gz
elif command -v wget &> /dev/null; then
  wget -qO /tmp/msf.tar.gz "https://github.com/$REPO/archive/refs/heads/main.tar.gz"
else
  echo -e "${RED}✗ curl or wget required.${NC}"
  exit 1
fi

tar -xzf /tmp/msf.tar.gz -C /tmp/

# Replace code only — never touch ~/.msf/ user data
rm -rf "$MSF_CODE_DIR"
mkdir -p "$MSF_CODE_DIR"
cp -r /tmp/msf-main/* "$MSF_CODE_DIR/"
rm -rf /tmp/msf.tar.gz /tmp/msf-main

echo -e "${CYAN}→ Installing dependencies...${NC}"
cd "$MSF_CODE_DIR"
npm install --silent

# Create the msf binary pointing to code dir
cat > "$BIN_DIR/msf" << 'EOF'
#!/usr/bin/env bash
node "$HOME/.msf-app/bin/msf.js" "$@"
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

export PATH="$BIN_DIR:$PATH"

echo ""
echo -e "${GREEN}${BOLD}✓ MSF installed successfully!${NC}"
echo ""
echo -e "  Code lives in:   ${CYAN}~/.msf-app/${NC}"
echo -e "  Your data lives in: ${CYAN}~/.msf/${NC}  ${YELLOW}(never touched on update)${NC}"
echo ""

# Only run setup on first install (no config yet)
if [ ! -f "$MSF_DATA_DIR/config.json" ]; then
  echo -e "${YELLOW}Starting setup wizard...${NC}"
  echo ""
  # Redirect stdin from /dev/tty so interactive prompts work when piped via curl | bash
  exec node "$MSF_CODE_DIR/bin/msf.js" setup < /dev/tty
else
  echo -e "${GREEN}✓ Existing setup detected — your config, memory and soul are untouched.${NC}"
  echo -e "  Run ${CYAN}${BOLD}msf${NC} to start."
  echo ""
fi
