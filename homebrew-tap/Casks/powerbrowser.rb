# DIST-11: the own-tap cask for PowerBrowser. Per-release values are tokens that the DIST-12 leg renders from the
# release key; scripts/verify-homebrew-cask.mjs derives each rendered value at check time. The DMG asset name and
# its digest render a fixture until the Phase 55 macOS asset exists (assumption A3).
# deferred: aarch64-darwin and Gatekeeper passage wait on Phase 55 (A3); this cask makes no signing claim.
cask "powerbrowser" do
  version "@RELEASE_VERSION@"
  sha256 "@MACOS_DMG_SHA256@"

  url "https://github.com/@RELEASE_REPO@/releases/download/@RELEASE_KEY@/@MACOS_DMG_ASSET@",
      verified: "github.com/@RELEASE_REPO@/"
  name "PowerBrowser"
  desc "Browser platform: a Gecko shell with a Theia sidecar as its default interface"
  homepage "https://powerbrowser.org"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :big_sur"

  app "PowerBrowser.app"

  uninstall delete: "/Applications/PowerBrowser.app"

  zap trash: "~/Library/Application Support/PowerBrowser"
end
