from copy import deepcopy

FUNDS = [
    {'name': 'Community Nutrition Grant', 'budget': 75000, 'restriction': 'SYNTHETIC §2: Food and delivery for the community meal program only.'},
    {'name': 'Youth Opportunity Grant', 'budget': 50000, 'restriction': 'SYNTHETIC §3: Youth learning supplies and documented program staff time only.'},
    {'name': 'Unrestricted Community Fund', 'budget': 30000, 'restriction': 'SYNTHETIC policy: General operating expenses require internal review.'},
]

def sample_data():
    specs = [
        ('E-101', 'Fresh produce • November meals', 2450, 0, 'Supported', 'Sample invoice describes food for the meal program.', 'Synthetic invoice INV-101: produce, $2,450.', []),
        ('E-102', 'Learning kits • youth workshops', 1280, 1, 'Supported', 'Sample purchase aligns with the fictional learning-supplies restriction.', 'Synthetic invoice INV-102: 40 learning kits.', []),
        ('E-103', 'Office internet', 180, 2, 'Supported', 'Sample general operating expense proposed to unrestricted funds.', 'Synthetic bill BILL-103: office internet.', []),
        ('E-104', 'Employee A • program payroll', 4200, 1, 'Needs Review', 'Employee works across both programs; no allocation percentage can be established.', 'Synthetic payroll PAY-104: gross wages $4,200; program split absent.', ['Signed timesheet', 'Program hours breakdown']),
        ('E-105', 'Fundraising dinner', 950, 0, 'Unsupported', 'The fictional food grant is restricted to community meals, not fundraising.', 'Synthetic receipt REC-105: donor fundraising dinner.', ['Alternative funding source review']),
        ('E-106', 'Meal delivery mileage', 360, 0, 'Needs Review', 'Delivery is described, but supporting trip records are missing.', 'Synthetic expense EXP-106: mileage claim only.', ['Mileage log']),
    ]
    rows = [dict(id=i, expense=e, amount=a, fund=FUNDS[f]['name'], status=s, explanation=x,
                 restriction=FUNDS[f]['restriction'], evidence=v, references=[f'SYNTHETIC fixture {i} (embedded demo_data.py)'], missing=m)
            for i,e,a,f,s,x,v,m in specs]
    return deepcopy({'funds': FUNDS, 'transactions': rows})
