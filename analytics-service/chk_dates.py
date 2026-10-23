import pandas as pd, numpy as np
d = pd.read_csv('Agriculture_price_dataset.csv', usecols=['Commodity', 'Modal_Price', 'Price Date'])
s = d['Price Date'].astype(str)
dash = s.str.contains('-')
parts = s.str.replace('/', '-').str.split('-', expand=True).astype(int)
year = parts[2]
def to_dates(month, day):
    return pd.to_datetime(pd.DataFrame({'year': year, 'month': month, 'day': day}), errors='coerce')
A = to_dates(parts[0], parts[1])                                   # all month-first (your cleaned files)
B = to_dates(parts[1].where(dash, parts[0]), parts[0].where(dash, parts[1]))   # dashed rows day-first
for name, dt in (('A: all month-first (your cleaned files)', A), ('B: dashed rows day-first', B)):
    p = d[(d['Commodity'].str.lower() == 'potato') & (d['Modal_Price'] > 0)]
    daily = pd.Series(p['Modal_Price'].values, index=dt[p.index].values).groupby(level=0).median().sort_index()
    daily = daily[daily.index.notna()]
    jump = np.log(daily).diff().abs().mean()
    back = int((dt.diff().dt.days < 0).sum())
    print(f"{name} | file order goes back in time: {back} rows | potato avg daily price jump: {jump:.4f} | days: {len(daily)} | bad dates: {int(dt.isna().sum())}")
