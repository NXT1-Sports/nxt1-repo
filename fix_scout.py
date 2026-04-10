import urllib.request
import re

with open('packages/ui/src/scout-reports/scout-reports.service.ts', 'r') as f:
    content = f.read()

# Uncomment the API inject
content = content.replace('// private readonly api = inject(ScoutReportsApiService);', 'private readonly api = inject(ScoutReportsApiService);')

# Fix _badges initial state 
content = content.replace('private readonly _badges = signal<Record<ScoutReportCategoryId, number>>({} as any);', 
'''private readonly _badges = signal<Record<ScoutReportCategoryId, number>>({
    all: 0,
    trending: 0,
    'new-reports': 0,
    'top-rated': 0,
    premium: 0,
    bookmarked: 0
  });''') 

with open('packages/ui/src/scout-reports/scout-reports.service.ts', 'w') as f:
    f.write(content)
