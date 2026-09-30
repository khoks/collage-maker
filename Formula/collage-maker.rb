# Homebrew formula for Collage Maker. Install with:
#   brew tap khoks/collage-maker https://github.com/khoks/collage-maker
#   brew install khoks/collage-maker/collage-maker
# The url and sha256 below are updated automatically by .github/workflows/release.yml.
class CollageMaker < Formula
  desc "Photo collage maker with white borders and 8K output, fully offline"
  homepage "https://github.com/khoks/collage-maker"
  url "https://github.com/khoks/collage-maker/releases/download/v1.0.0/collage-maker.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  license "MIT"

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    libexec.install "collage-maker", "collage-maker.html", "icons"
    bin.install_symlink libexec/"collage-maker"
  end

  def caveats
    <<~EOS
      Start Collage Maker with:
        collage-maker
      It opens in its own window in Chrome, Edge, Brave or Chromium when one is
      installed, otherwise in your default browser.

      To add it to Launchpad and Spotlight (macOS) or your app menu (Linux), run:
        collage-maker --install-shortcut
    EOS
  end

  test do
    assert_equal (libexec/"collage-maker.html").realpath.to_s, shell_output("#{bin}/collage-maker --path").strip
    assert_match version.to_s, shell_output("#{bin}/collage-maker --version")
    assert_match "<canvas", (libexec/"collage-maker.html").read
  end
end
