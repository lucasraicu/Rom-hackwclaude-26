import pandas as pd
import streamlit as st
from demo_data import sample_data
from api_client import analyze, is_excluded_document

st.set_page_config(page_title='FundProof | Allocation workspace', page_icon=':material/account_balance:', layout='wide')
st.markdown('''<style>
.stApp {background:radial-gradient(ellipse at 90% 0%,#202d49 0%,#17191d 42%);color:#f5f5f7}
[data-testid="stHeader"] {background:#17191d}
.block-container {padding-top:3.5rem;max-width:1450px;padding-bottom:4rem}
h1,h2,h3 {color:#fafafa!important;letter-spacing:-.045em}
h1 {font-size:clamp(2.6rem,5vw,4.5rem)!important;font-weight:600!important;line-height:1.08!important;padding-bottom:1rem!important}
h2 {font-size:1.65rem!important;margin-top:1.5rem!important}
p,li,label {line-height:1.65}
[data-testid="stCaptionContainer"] {color:#bdc4d0!important}
[data-testid="stSidebar"] {background:#141518;border-right:1px solid #353a44}
[data-testid="stSidebar"] h1 {font-size:2rem!important;letter-spacing:-.06em}
[data-testid="stSidebar"] [data-testid="stRadio"] label {padding:.45rem .6rem;border-radius:6px}
[data-testid="stSidebar"] [data-testid="stRadio"] label:has(input:checked) {background:#26334d;border-left:3px solid #a7c3ff}
[data-testid="stMetric"] {background:#20242c;border:1px solid #414854;border-radius:8px;padding:22px}
[data-testid="stMetricLabel"] {color:#cbd2de}
[data-testid="stMetricValue"] {color:#ffffff;font-weight:550;letter-spacing:-.04em}
[data-testid="stVerticalBlockBorderWrapper"]>div {border-color:#414854!important}
[data-testid="stForm"] {background:#1e222a;border-color:#414854;border-radius:8px}
.stButton>button[kind="primary"],.stDownloadButton>button[kind="primary"] {background:#bad0ff;color:#101b30;border:1px solid #bad0ff;font-weight:650}
.stButton>button[kind="primary"]:hover,.stDownloadButton>button[kind="primary"]:hover {background:#d6e3ff;color:#101b30;border-color:#d6e3ff}
button:focus-visible,input:focus-visible,textarea:focus-visible {outline:3px solid #bad0ff!important;outline-offset:3px}
[data-testid="stAlert"] {border:1px solid #536079}
@media(max-width:700px) {.block-container {padding:2rem 1rem} h1 {font-size:2.5rem!important}}
</style>''', unsafe_allow_html=True)
if 'data' not in st.session_state:
    st.session_state.data = {'funds': [], 'transactions': []}
    st.session_state.reviews = {}
    st.session_state.origin = 'No results loaded'
with st.sidebar:
    st.title('FundProof')
    st.caption('EVERY DOLLAR. CLEARLY SUPPORTED.')
    page = st.radio('Workspace', ['Overview', 'Upload Documents', 'Allocation Review', 'Evidence and Explanation', 'Review and Clarification', 'Export'])
    st.divider()
    demo = st.toggle('Demo Mode', value=True)
    st.caption('Synthetic nonprofit: Harbor Community Network')
    st.info('Human review required. Recommendations are never automatically approved.')

st.caption('ALLOCATION WORKSPACE / NOVEMBER 2026')
st.title(page)
st.caption('From financial records to evidence-backed review.')
if st.session_state.origin == 'No results loaded':
    st.info('No results loaded. Open Upload Documents to load mock sample results or analyze documents.')
else:
    st.warning('MOCK DATA • All organizations, restrictions, evidence and recommendations in the sample are fictional.' if st.session_state.origin.startswith('Synthetic') else 'BACKEND RESULTS • Recommendations require human review.')
data = st.session_state.data
rows = data['transactions']
reviews = st.session_state.reviews

def table():
    return pd.DataFrame([{'ID':t['id'], 'Expense':t['expense'], 'Amount':t['amount'], 'Proposed funding':t['fund'], 'Recommendation':t['status'], 'Reviewer decision':reviews.get(t['id'],{}).get('decision','Not reviewed'), 'Explanation':t['explanation']} for t in rows])

def evidence(t):
    st.subheader(t['expense'])
    st.metric('Proposed amount', f"${t['amount']:,.2f}")
    st.write('**Proposed funding:**', t['fund'])
    {'Supported':st.success,'Needs Review':st.warning,'Unsupported':st.error}[t['status']](t['status'] + ' — recommendation only')
    st.write(t['explanation'])
    with st.container(border=True):
        st.markdown('#### Grant restrictions')
        st.write(t['restriction'] or 'No restriction supplied.')
        st.markdown('#### Transaction evidence')
        st.write(t['evidence'] or 'No evidence supplied.')
        st.markdown('#### Source references')
        for ref in t['references']: st.text(ref)
        if not t['references']: st.warning('No source references supplied. Evidence is unverified.')
    if t['missing']: st.warning('Missing / unresolved: ' + '; '.join(t['missing']))

if page == 'Overview':
    cols=st.columns(4)
    metrics=[('Funding sources',len(data['funds'])),('Reviewed expenses',len(reviews)),('Proposed allocations',f"${sum(t['amount'] for t in rows):,.0f}"),('Unresolved items',sum(bool(t['missing']) or t['status']!='Supported' for t in rows))]
    for c,(label,value) in zip(cols,metrics): c.metric(label,value)
    st.subheader('Funding at a glance')
    for c,f in zip(st.columns(max(1,len(data['funds']))),data['funds']):
        with c.container(border=True):
            st.write('**'+f['name']+'**')
            st.metric('Sample award / fund budget',f"${f['budget']:,.0f}")
            st.caption(f['restriction'])
    a,b=st.columns(2)
    with a:
        st.subheader('Proposed dollars by source')
        if rows: st.bar_chart(table().groupby('Proposed funding')['Amount'].sum(),color='#a7c3ff')
    with b:
        st.subheader('Recommendation queue')
        if rows: st.bar_chart(table()['Recommendation'].value_counts(),color='#c4acf0')
    st.caption('Proposed amounts are not approved spending or remaining grant balances.')
elif page == 'Upload Documents':
    if st.session_state.get('load_message'):
        st.success(st.session_state.load_message)
    st.write('Stage documents for analysis. Demo Mode loads the fixed sample and does not analyze uploads.')
    files=[]
    for kind,label,types in [('grant','Grant agreements',['pdf','txt']),('expenses','Expense transactions',['csv']),('payroll','Payroll and employee time records',['csv']),('supporting','Supporting receipts / invoices',['pdf','png','jpg','jpeg']),('evidence_register','Evidence register',['csv'])]:
        selected=st.file_uploader(label,type=types,accept_multiple_files=True,key=kind)
        for f in selected:
            if is_excluded_document(f.name):
                st.error(f'{f.name} is a test-only file and cannot be submitted for analysis.')
            else:
                files.append((kind,f))
    if files: st.dataframe(pd.DataFrame([{'Name':f.name,'Type':kind,'Bytes':f.size,'Status':'Staged • not analyzed'} for kind,f in files]),hide_index=True)
    st.caption('Loading a new result replaces the current review session.')
    confirm=st.checkbox('Replace current reviews with the new analysis',value=False) if reviews else True
    if st.button('Load sample results' if demo else 'Analyze documents',type='primary',disabled=not confirm):
        try:
            if not demo and not files: raise ValueError('Upload at least one document first.')
            if not demo and any(f.size>10*1024*1024 for _,f in files): raise ValueError('Each document must be at most 10 MB.')
            with st.spinner('Loading sample fixtures…' if demo else 'Waiting for backend analysis…'):
                result=sample_data() if demo else analyze(files)
            st.session_state.data=result
            st.session_state.reviews={}
            st.session_state.origin='Synthetic sample results' if demo else 'Backend analysis'
            st.session_state.load_message = (f'Mock sample results loaded: {len(result["transactions"])} allocations. No backend or AI was called.' if demo else f'Backend results loaded: {len(result["transactions"])} allocations.')
            st.rerun()
        except ValueError as exc: st.error(str(exc))
    if rows:
        st.subheader('Loaded allocation results')
        st.caption(st.session_state.origin + ' - open Allocation Review to inspect evidence and record decisions.')
        st.dataframe(table(), hide_index=True, width='stretch')
elif page in ('Allocation Review','Evidence and Explanation','Review and Clarification'):
    st.info('Proposals are not approved allocations. Reviewer decisions are stored separately.')
    statuses=st.multiselect('Recommendation filter',['Supported','Needs Review','Unsupported'],default=['Supported','Needs Review','Unsupported'])
    filtered=[t for t in rows if t['status'] in statuses]
    if not filtered: st.info('No transactions match this filter.')
    else:
        st.dataframe(table()[table()['ID'].isin([t['id'] for t in filtered])],hide_index=True,width='stretch',column_config={'Amount':st.column_config.NumberColumn(format='$%.2f')})
        selected=st.selectbox('Select transaction',[t['id'] for t in filtered],format_func=lambda i: next(t['expense'] for t in filtered if t['id']==i))
        t=next(t for t in filtered if t['id']==selected)
        left,right=st.columns([3,2])
        with left: evidence(t)
        with right:
            st.subheader('Human review')
            previous=reviews.get(selected,{})
            st.caption('Saved decision: '+previous.get('decision','Not reviewed'))
            with st.form('review_'+selected):
                notes=st.text_area('Review notes / missing information',value=previous.get('notes',''))
                decision=st.selectbox('Reviewer action',['Needs more information','Approve for export','Reject'])
                acknowledged=st.checkbox('I reviewed the evidence and unresolved issues')
                if st.form_submit_button('Save review',type='primary'):
                    if not notes.strip(): st.error('Add review notes to explain your decision.')
                    elif decision=='Approve for export' and not acknowledged: st.error('Acknowledge your evidence review first.')
                    else:
                        reviews[selected]={'decision':decision,'notes':notes}
                        st.rerun()
            st.caption('Session-only demo decisions. Approval for export is not a compliance determination. Missing evidence remains visible in the report.')
elif page == 'Export':
    st.subheader('Review report')
    st.write('Download all reviewed items, including rejected items and requests for information. Only rows explicitly approved by a reviewer are marked approved for export.')
    report=[]
    for t in rows:
        if t['id'] in reviews:
            report.append({**t,**reviews[t['id']], 'references':'; '.join(t['references']), 'missing':'; '.join(t['missing']), 'provenance':st.session_state.origin})
    if not report: st.info('No reviews saved yet. Review a transaction to prepare your report.')
    else:
        df=pd.DataFrame(report)
        st.dataframe(df,hide_index=True)
        # Prevent spreadsheet software from interpreting user-entered text as formulas.
        safe=df.map(lambda v: "'"+v if isinstance(v,str) and v.lstrip().startswith(('=','+','-','@')) else v)
        st.download_button('Download reviewed allocations CSV',safe.to_csv(index=False).encode('utf-8-sig'),'fundproof-reviewed.csv','text/csv',type='primary')
