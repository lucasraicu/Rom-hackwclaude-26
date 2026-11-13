"""Proposed transport only; never substitutes sample results for backend failures."""
import base64
import json
import math
import os
from urllib.request import Request, urlopen
from urllib.error import URLError


def is_excluded_document(name):
    """Block the test answer key before reading or transmitting file contents."""
    return name.replace('\\', '/').rsplit('/', 1)[-1].casefold() == 'expected_test_cases_do_not_upload.txt'


def analyze(files):
    if any(is_excluded_document(f.name) for _, f in files):
        raise ValueError('Test-only expected cases must never be submitted for analysis.')
    url = os.getenv('FUNDPROOF_BACKEND_URL', '').rstrip('/')
    if not url.startswith(('http://', 'https://')):
        raise ValueError('Set FUNDPROOF_BACKEND_URL to the agreed backend URL first.')
    payload = {'documents': [dict(kind=kind, name=f.name, content_base64=base64.b64encode(f.getvalue()).decode()) for kind, f in files]}
    try:
        request = Request(url + '/analyze', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'}, method='POST')
        with urlopen(request, timeout=60) as response:
            data = json.load(response)
        validate(data)
        return data
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ValueError('Backend analysis failed. Check the service and try again; no sample results were substituted.') from exc


def validate(data):
    try:
        assert isinstance(data['funds'], list) and isinstance(data['transactions'], list)
        names = set()
        for f in data['funds']:
            assert all(isinstance(f[k], str) for k in ('name', 'restriction'))
            assert isinstance(f['budget'], (int, float)) and math.isfinite(f['budget']) and f['budget'] >= 0
            assert f['name'] not in names
            names.add(f['name'])
        ids = set()
        for t in data['transactions']:
            assert all(isinstance(t[k], str) for k in ('id','expense','fund','status','explanation','restriction','evidence'))
            assert t['id'] and t['id'] not in ids
            ids.add(t['id'])
            assert t['fund'] in names
            assert t['status'] in ('Supported', 'Needs Review', 'Unsupported')
            assert isinstance(t['amount'], (int,float)) and math.isfinite(t['amount']) and t['amount'] >= 0
            assert all(isinstance(t[k], list) and all(isinstance(v,str) for v in t[k]) for k in ('references','missing'))
    except (KeyError, TypeError, AssertionError) as exc:
        raise ValueError('Backend response does not match the proposed contract.') from exc
