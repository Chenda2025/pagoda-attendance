import re

with open('static/js/layout.js', 'r') as f:
    content = f.read()

# 1. permissionsMap (take incoming)
content = re.sub(r'<<<<<<< HEAD\n=======\n(let permissionsMap[^\n]+)\n>>>>>>>[^\n]+', r'\1', content)

# 2. ordered.push(null) (take incoming)
content = re.sub(r'<<<<<<< HEAD\n        const m = byId\.get\(id\);\n        if \(m\) { ordered\.push\(m\); seen\.add\(id\); }\n=======\n(.*?)>>>>>>>[^\n]+', r'\1', content, flags=re.DOTALL)

# 3. current.map(m => m ? m.id : null) (take incoming)
content = re.sub(r'<<<<<<< HEAD\n    const ids = current\.map\(m => m\.id\);\n=======\n(    const ids = current\.map\(m => m \? m\.id : null\);)\n>>>>>>>[^\n]+', r'\1', content)

# 4 & 5. renderTotals() (take incoming)
content = re.sub(r'<<<<<<< HEAD\n=======\n(    renderTotals\(\);\n)>>>>>>>[^\n]+', r'\1', content)

# 6. grid_config (take HEAD)
content = re.sub(r'<<<<<<< HEAD\n(// ============ GRID CONFIG ============.*?)\n=======\n>>>>>>>[^\n]+', r'\1', content, flags=re.DOTALL)

# 7. _applyGridConfig (take HEAD)
content = re.sub(r'<<<<<<< HEAD\n(        _applyGridConfig\(json\.grid_config\);\n)=======\n>>>>>>>[^\n]+', r'\1', content)

# 8. Attendance list modal (take incoming)
content = re.sub(r'<<<<<<< HEAD\n=======\n(    // Attendance list modal.*?)\n>>>>>>>[^\n]+', r'\1', content, flags=re.DOTALL)

# 9. btn-gen and submit (combine manually)
c9 = """    document.getElementById('btn-gen-bhikkhu')?.addEventListener('click', () => { generateBhikkhu(); saveGridConfig(); });
    document.getElementById('btn-gen-samanera')?.addEventListener('click', () => { generateSamanera(); saveGridConfig(); });
    document.getElementById('btn-submit-att').addEventListener('click', () => {
        const dd = document.getElementById('lay-export-dd');
        if (dd) dd.classList.remove('open');
        submitAttendance();
    });"""
content = re.sub(r'<<<<<<< HEAD\n.*?btn-submit-att.*?\n=======\n.*?btn-submit-att.*?\n>>>>>>>[^\n]+', c9, content, flags=re.DOTALL)

# 10. keydown (take HEAD with comment from incoming)
c10 = """    // Regenerate on Enter key
    document.getElementById('bhikkhu-rows')?.addEventListener('keydown',  e => { if (e.key === 'Enter') { generateBhikkhu();  saveGridConfig(); } });
    document.getElementById('bhikkhu-cols')?.addEventListener('keydown',  e => { if (e.key === 'Enter') { generateBhikkhu();  saveGridConfig(); } });
    document.getElementById('samanera-rows')?.addEventListener('keydown', e => { if (e.key === 'Enter') { generateSamanera(); saveGridConfig(); } });
    document.getElementById('samanera-cols')?.addEventListener('keydown', e => { if (e.key === 'Enter') { generateSamanera(); saveGridConfig(); } });"""
content = re.sub(r'<<<<<<< HEAD\n.*?samanera-cols.*?\n=======\n.*?samanera-cols.*?\n>>>>>>>[^\n]+', c10, content, flags=re.DOTALL)

with open('static/js/layout.js', 'w') as f:
    f.write(content)
