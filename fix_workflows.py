import re

def fix_workflow(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Find the top-level env block and remove TURBO_TOKEN & TURBO_TEAM
    content = re.sub(r'  # Optional.*?\n', '', content)
    content = re.sub(r'\n\s*TURBO_TOKEN: \$\{\{ secrets\.TURBO_TOKEN \|\| '\''\'\' \}\}', '', content)
    content = re.sub(r'\n\s*TURBO_TOKEN: \$\{\{ secrets\.TURBO_TOKEN \}\}', '', content)
    
    content = re.sub(r'\n\s*TURBO_TEAM: \$\{\{ vars\.TURBO_TEAM \|\| '\''\'\' \}\}', '', content)
    content = re.sub(r'\n\s*TURBO_TEAM: \$\{\{ vars\.TURBO_TEAM \}\}', '', content)
    
    # Now, explicitly add these to jobs that need it.
    jobs_to_patch = ['lint:', 'typecheck:', 'build-core:', 'build-web:', 'build-mobile:', 'test:', 'e2e-tests:']
    
    lines = content.split('\n')
    new_lines = []
    
    for line in lines:
        new_lines.append(line)
        for job in jobs_to_patch:
            if line.startswith(f'  {job}'):
                new_lines.append('    env:')
                new_lines.append('      TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}')
                new_lines.append('      TURBO_TEAM: ${{ vars.TURBO_TEAM }}')
                
    with open(filepath, 'w') as f:
        f.write('\n'.join(new_lines))

import sys
fix_workflow(sys.argv[1])
fix_workflow(sys.argv[2])
