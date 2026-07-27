#!/usr/bin/env bash
set -euo pipefail

REPO="z3r0n3br4instorm/AbstractCodingInterface"
EXTENSION_NAME="aci"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}${BOLD}[ACI]${NC} $*"; }
success() { echo -e "${GREEN}${BOLD}[ACI]${NC} $*"; }
error()   { echo -e "${RED}${BOLD}[ACI] ERROR:${NC} $*" >&2; exit 1; }

# ── Dependency checks ────────────────────────────────────────────────────────

check_deps() {
  for cmd in curl jq code; do
    if ! command -v "$cmd" &>/dev/null; then
      error "Required command not found: '$cmd'. Please install it and retry."
    fi
  done
}

# ── Resolve latest release from GitHub API ───────────────────────────────────

get_latest_release() {
  info "Fetching latest release from GitHub..."
  local api_url="https://api.github.com/repos/${REPO}/releases/latest"

  RELEASE_JSON=$(curl -fsSL "$api_url") \
    || error "Failed to reach GitHub API. Check your internet connection."

  RELEASE_TAG=$(echo "$RELEASE_JSON" | jq -r '.tag_name') \
    || error "Could not parse release tag from GitHub response."

  VSIX_URL=$(echo "$RELEASE_JSON" | jq -r '.assets[] | select(.name | endswith(".vsix")) | .browser_download_url' | head -n1)

  if [[ -z "$VSIX_URL" || "$VSIX_URL" == "null" ]]; then
    error "No .vsix asset found in the latest release (${RELEASE_TAG}). Please check the GitHub releases page."
  fi

  VSIX_FILENAME=$(echo "$RELEASE_JSON" | jq -r '.assets[] | select(.name | endswith(".vsix")) | .name' | head -n1)

  info "Latest release : ${BOLD}${RELEASE_TAG}${NC}"
  info "Asset          : ${BOLD}${VSIX_FILENAME}${NC}"
}

# ── Download the VSIX ────────────────────────────────────────────────────────

download_vsix() {
  local tmp_dir
  tmp_dir=$(mktemp -d)
  VSIX_PATH="${tmp_dir}/${VSIX_FILENAME}"

  info "Downloading ${VSIX_FILENAME}..."
  curl -fsSL --progress-bar -o "$VSIX_PATH" "$VSIX_URL" \
    || error "Download failed. URL: ${VSIX_URL}"

  success "Download complete."
}

# ── Install via VS Code CLI ───────────────────────────────────────────────────

install_vsix() {
  info "Installing extension into VS Code..."
  code --install-extension "$VSIX_PATH" --force \
    || error "Installation failed. Make sure VS Code is installed and 'code' is in your PATH."

  success "ACI (${RELEASE_TAG}) installed successfully!"
  echo ""
  echo -e "  ${BOLD}Next steps:${NC}"
  echo -e "  1. Reload VS Code (Ctrl+Shift+P → 'Developer: Reload Window')"
  echo -e "  2. Open a .aci file or run ${CYAN}ACI: Make File PSyx Compatible${NC} on any source file."
  echo -e "  3. Configure via ${CYAN}Ctrl+,${NC} → search 'ACI' or use the ${CYAN}circuit-board${NC} sidebar icon."
  echo ""
}

# ── Cleanup ───────────────────────────────────────────────────────────────────

cleanup() {
  if [[ -n "${VSIX_PATH:-}" ]]; then
    rm -f "$VSIX_PATH"
    rmdir "$(dirname "$VSIX_PATH")" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── Main ──────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}ACI — Abstract Coding Interface Installer${NC}"
echo -e "Repo: https://github.com/${REPO}"
echo ""

check_deps
get_latest_release
download_vsix
install_vsix
