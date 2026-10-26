# Save as .github/workflows/fairsourse-refresh.yml in a repo that also contains fairsourse-agent.js
# Add these repository secrets: ALI_APP_KEY, ALI_APP_SECRET, ALI_TRACKING_ID, ANTHROPIC_API_KEY (optional), FB_PAGE_ID, FB_PAGE_TOKEN
name: Fairsourse daily refresh
on:
  schedule:
    - cron: "0 6 * * *"   # every day at 06:00 UTC
  workflow_dispatch: {}    # also lets you run it by hand
permissions:
  contents: write
jobs:
  refresh:
    runs-on: ubuntu-latest
    env:
      ALI_APP_KEY: ${{ secrets.ALI_APP_KEY }}
      ALI_APP_SECRET: ${{ secrets.ALI_APP_SECRET }}
      ALI_TRACKING_ID: ${{ secrets.ALI_TRACKING_ID }}
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      FB_PAGE_ID: ${{ secrets.FB_PAGE_ID }}
      FB_PAGE_TOKEN: ${{ secrets.FB_PAGE_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: node fairsourse-agent.js feed
      - run: node fairsourse-agent.js post
      - name: Keep the new feed and manual queue in the repo
        run: |
          git config user.name "fairsourse-bot"
          git config user.email "bot@users.noreply.github.com"
          git add products.json history.json state.json manual-queue.txt || true
          git commit -m "Daily feed refresh" || echo "No changes"
          git push
