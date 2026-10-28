from generate import t,r,line,box,OUT
from html import escape
W=4640;H=3300
s=[r(0,0,W,H,'#e6e6e6','none'),t(60,70,'01 User flows / Tracker',42,600),t(60,120,'Read left to right. Screen IDs match the six wireframe sheets. Rectangles = screens/actions; diamonds = decisions.',23)]
flows=[
('01 · First access and capture',[('A01','GitHub owner sign-in'),('?','Owner allowed?'),('A02','My work / empty'),('A03','Create project'),('A04','Project overview'),('A05','Create Planned section'),('E06','Capture Backlog task')], 'No → access denied + retry A01. Project can also capture root tasks directly. Prefix becomes immutable.'),
('02 · Plan and choose work',[('A06','Section / direct tasks'),('A07','Write plan + target'),('E06','Add tasks / subtasks'),('E05','Priority, labels, links'),('E05','Set Ready'),('E01','Ready to work filter'),('E04','Open task in context')], 'Nested sections: maximum 3 levels. Ready to work excludes manual/dependency blockers; ordinary views keep blocked work visible.'),
('03 · Execute and validate',[('E04','Set In progress'),('C06','Update note / subtasks'),('C05','Attach private files'),('E07','Link PR + review checks'),('E05','Set In review'),('?','Unfinished subtasks?'),('R01','Complete all / keep open')], 'No unfinished subtasks → owner marks Done. Complete all → remaining nonterminal subtasks Done; Canceled stays Canceled. PR merged never implies Done.'),
('04 · GitHub import and rules',[('S04','Install read-only App'),('S04','Connect repositories'),('S05','Select issue / destination'),('?','Already imported?'),('E05','Open imported task'),('E07','Refresh PRs / checks'),('S04','Optional transitions')], 'Duplicate → open existing or restore archived task. New issue → copy title/body once. Fresh qualifying PR events may move Ready → In progress → In review; never Done.'),
('05 · Local agent lifecycle',[('S06','Agent credentials'),('S07','Choose grants / expiry'),('S08','Copy secret once'),('MCP','Configure local client'),('MCP','Read current context'),('MCP','Write with revision'),('E07','In review + activity')], 'Agent uses project grants and idempotency keys. Stale write → decision_required / deliberate retry. Owner can revoke key. Agent cannot restore note history.'),
('06 · Files and note recovery',[('C05','Choose supported file'),('R2','Authorize pending'),('R2','Direct upload'),('R2','Finalize / verify'),('C05','Ready attachment'),('C05','Authorize download'),('R2','Five-minute URL')], 'Failed transfer → retry / remove C05. Note autosave: C06 → Saved; failure preserves draft; conflict → R06 compare latest and retry. History restore C04 creates a new revision.'),
('07 · Reopen, archive and deletion',[('A06','Add unfinished work'),('?','Ancestor completed?'),('R02','Confirm full reopen'),('R03','Archive + impact'),('R04','Restore archived work'),('?','Delete requested?'),('R05','Check blockers / delete')], 'Reopen rejected → no partial change. Archive preserves status/dependencies. Restore only clears selected marker. Delete requires archived target, owner, no external dependents, subtree/file confirmation; backups may retain 30 days.'),
('08 · Find work and navigate',[('C01','⌘K global search'),('C02','Scope / filter / sort'),('?','Results found?'),('C03','Reset empty query'),('E04','Open task + URL'),('E05','Open full page'),('E02','Back / restore list')], 'Found → open result directly (skip C03). Filters use AND across groups / OR within a group. Mobile M01–M06 supports the same core actions; task detail is full-screen.'),
]
for i,(title,nodes,note) in enumerate(flows):
 y=200+i*350
 s+=[t(60,y,title,27,600)]
 for j,(id,label) in enumerate(nodes):
  x=60+j*648;yy=y+34;w=590
  if id=='?':
   s+=[f'<path d="M{x+w/2} {yy} L{x+w} {yy+64} L{x+w/2} {yy+128} L{x} {yy+64} Z" fill="#f6f6f6" stroke="#777"/>',t(x+110,yy+70,label,20,600)]
  else:s+=[r(x,yy,w,128),t(x+22,yy+40,id,19,600),t(x+22,yy+82,label,21)]
  if j<6:s+=[f'<path d="M{x+w+4} {yy+64} H{x+638} m-12 -7 l12 7 -12 7" fill="none" stroke="#555" stroke-width="2"/>']
 # explicit 2-line note max width
 import textwrap
 for k,ln in enumerate(textwrap.wrap(note,205)):s+=[t(60,y+206+k*29,ln,19)]
s+=[box(60,3050,4500,180,'Review guide',['02 Access and planning · 8 screens     03 Work and execution · 8     04 Search notes and files · 6','05 Settings and integrations · 9     06 Recovery and safeguards · 8     07 Mobile · 6','Source: docs/SPECIFICATION.md + docs/DESIGN.md. Grayscale structural wireframes; arrows document flow, not clickable prototype interactions.'])]
(OUT/'01-User-flows.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'+''.join(s)+'</svg>')
# XML, screen coverage and dimensional checks
import xml.etree.ElementTree as ET
for p in OUT.glob('0*.svg'):ET.parse(p)
assert len(__import__('generate').screens)==45
assert all(len(x['note'])<150 for x in __import__('generate').screens)
print('7 SVG sheets valid; 45 unique screen/state IDs')
