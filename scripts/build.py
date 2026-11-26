"""Build the open IODA viewer and static, directly usable ISP entry pages."""
from html import escape
import json
from pathlib import Path
import shutil
from search_metadata import add_search_metadata

ROOT = Path(__file__).resolve().parents[1]
out = ROOT / "dist"
if out.exists():
    shutil.rmtree(out)
shutil.copytree(ROOT / "web",out)
tool = json.loads((ROOT / "tool.json").read_text())
providers = json.loads((out / "providers.json").read_text())
template = (out / "index.html").read_text()
def build_page(provider=None):
    prefix = "../" if provider else "./"
    links = " · ".join(f'<a href="{prefix}{p["slug"]}/">{escape(p["name"])}</a>' for p in providers)
    page = template.replace("{{PROVIDERS}}",links)
    title = tool["title"]
    desc = tool["description"]
    url = tool["url"]
    context = ""
    if provider:
        name = provider["name"]
        number = provider["asn"]
        title = f"{name} internet outage signals"
        desc = f"Check recent routing, probing and connectivity measurements for {name} AS{number} and compare with dated outage observations."
        url += provider["slug"] + "/"
        context = f'<p>{escape(provider["context"])}</p><p><a href="{provider["support"]}" rel="external noreferrer">{escape(name)} service support</a></p>'
        page = page.replace("<body>",f'<body data-asn="{number}">').replace('src="./','src="../').replace('href="./style.css"','href="../style.css"')
        page = page.replace("Compare routing, active probing and background traffic to investigate historical connectivity disruptions.",
                            f"Loading the previous seven UTC dates for {name} AS{number}. Each source shows its own observation time.")
    page = (page.replace("{{TITLE}}",escape(title)).replace("{{DESCRIPTION}}",escape(desc,quote=True)).replace("{{CONTEXT}}",context))
    directory = out / provider["slug"] if provider else out
    directory.mkdir(exist_ok=True)
    (directory/"index.html").write_text(add_search_metadata(page,{**tool,"title":title,"description":desc,"url":url}))
build_page()
for provider in providers:
    build_page(provider)
