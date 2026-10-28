packages = ['docx', 'PIL', 'matplotlib', 'seaborn', 'pandas', 'numpy']
for pkg in packages:
    try:
        mod = __import__(pkg)
        ver = getattr(mod, '__version__', 'installed')
        print(f"{pkg}: OK ({ver})")
    except ImportError:
        print(f"{pkg}: MISSING")
