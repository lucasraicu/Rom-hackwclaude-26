from pathlib import Path
from streamlit.testing.v1 import AppTest
from api_client import validate
from demo_data import sample_data

validate(sample_data())
bad = sample_data()
bad['transactions'][0]['amount'] = float('nan')
try:
    validate(bad)
    raise AssertionError('Invalid amount accepted')
except ValueError:
    pass
app = AppTest.from_file(str(Path(__file__).with_name('app.py')), default_timeout=30).run()
assert not app.exception
# Exercise the real button from an empty session, with backend calls forbidden.
from unittest.mock import patch
from types import SimpleNamespace
from api_client import analyze, is_excluded_document
assert app.session_state['data']['transactions'] == []
app.sidebar.radio[0].set_value('Upload Documents').run()
assert len(app.get('file_uploader')) == 6
assert app.get('file_uploader')[-1].label == 'Other Supporting Documents'
with patch('api_client.analyze', side_effect=AssertionError('Demo contacted backend')):
    app.button[0].click().run()
assert not app.exception
assert len(app.session_state['data']['transactions']) == 6
assert any('Mock sample results loaded: 6' in x.value for x in app.success)
assert len(app.dataframe[0].value) == 6
app.run()
assert any('Mock sample results loaded' in x.value for x in app.success)
app.sidebar.radio[0].set_value('Overview').run()
assert [m.value for m in app.metric[:4]] == ['3', '0', '$9,420', '3']
app.sidebar.radio[0].set_value('Allocation Review').run()
assert set(app.dataframe[0].value['Recommendation']) == {'Supported','Unsupported','Needs Review'}
app.selectbox[0].set_value('E-104').run()
assert any('Signed timesheet' in x.value for x in app.warning)
assert any('Synthetic payroll PAY-104' in x.value for x in app.markdown)
assert is_excluded_document('folder/EXPECTED_TEST_CASES_DO_NOT_UPLOAD.txt')
with patch('api_client.urlopen', side_effect=AssertionError('Answer key was transmitted')):
    try:
        analyze([('grant', SimpleNamespace(name='EXPECTED_TEST_CASES_DO_NOT_UPLOAD.txt'))])
        raise AssertionError('Answer key accepted')
    except ValueError as exc:
        assert 'Test-only' in str(exc)
for page in ['Upload Documents','Allocation Review','Evidence and Explanation','Review and Clarification','Export','Overview']:
    app.sidebar.radio[0].set_value(page).run()
    assert not app.exception, page
app.sidebar.radio[0].set_value('Allocation Review').run()
app.text_area[0].set_value('Synthetic evidence checked')
app.selectbox[1].set_value('Approve for export')
app.checkbox[0].check()
app.button[0].click().run()
assert app.session_state['reviews']['E-101']['decision'] == 'Approve for export'
assert app.selectbox[1].value == 'Approve for export'
app.sidebar.radio[0].set_value('Export').run()
assert not app.exception
assert len(app.dataframe[0].value) == 1
print('PASS: all sections, contract validation, review persistence and export data')


# Reload requires confirmation before discarding saved reviews.
app.sidebar.radio[0].set_value('Upload Documents').run()
assert app.button[0].disabled
app.checkbox[0].check().run()
app.button[0].click().run()
assert not app.exception
assert app.session_state['reviews'] == {}
assert len(app.session_state['data']['transactions']) == 6
assert app.success
print('PASS: sample button, metrics, status cases, evidence, reload and answer-key exclusion')

# Verify staging and backend exclusion through the UI with mocked upload selections.
other_files = [SimpleNamespace(name='approval.docx', size=20),
               SimpleNamespace(name='records.xlsx', size=30)]
grant = SimpleNamespace(name='grant.pdf', size=40)
app.sidebar.radio[0].set_value('Upload Documents').run()
app.sidebar.toggle[0].set_value(False).run()
for include_grant in (True, False):
    def uploads(label, **kwargs):
        if kwargs['key'] == 'other':
            assert kwargs['accept_multiple_files'] is True
            assert set(kwargs['type']) == {'pdf','txt','csv','docx','xlsx','png','jpg'}
            return other_files
        return [grant] if include_grant and kwargs['key'] == 'grant' else []
    with patch('streamlit.file_uploader', side_effect=uploads), patch('api_client.analyze', return_value=sample_data()) as backend:
        app.run()
        staged = app.dataframe[0].value
        assert set(staged['Name']) == ({'grant.pdf'} if include_grant else set()) | {'approval.docx', 'records.xlsx'}
        assert all('not sent to backend' in status for status in staged[staged['Type'] == 'other']['Status'])
        app.button[0].click().run()
        assert not app.exception
        if include_grant:
            backend.assert_called_once_with([('grant', grant)])
        else:
            backend.assert_not_called()
            assert any('staged only' in error.value for error in app.error)
print('PASS: miscellaneous uploads staged, mixed uploads filtered, other-only analysis blocked')
