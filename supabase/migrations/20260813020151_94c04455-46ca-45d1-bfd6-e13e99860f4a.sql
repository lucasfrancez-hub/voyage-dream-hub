UPDATE public.airfare_promotions
SET scope = 'nacional'
WHERE scope <> 'nacional'
  AND upper(trim(destination_iata)) IN (
    'GRU','CGH','VCP','GIG','SDU','CNF','PLU','UDI','UBA','IPN','MOC','JDF','VIX','SBJ',
    'RAO','SJP','PPB','MII','BAU','SOD','AQA','SJK','QDC','JTC','ITU','ORX',
    'CWB','LDB','MGF','FLN','POA','NVT','JOI','XAP','CXJ','PET','URG','IJU','PFB','CCM','BNU','GEL','SQX','LOI','CAC','IGU','TOW','PGZ','APU',
    'BSB','CGB','CGR','GYN','ROO','BPG','CMG','DOU','AAG',
    'SSA','REC','FOR','NAT','MCZ','AJU','THE','SLZ','JPA','BPS','IOS','PNZ','JDO','PHB','CPV','IMP','URC','VDC','LEC','STZ','TXF','BRA','GNM','MVF','JJD','PTO',
    'BEL','MAO','MCP','PVH','RBR','BVB','STM','PMW','MAB','ATM','AUX','TFF','CZS','TBT','OIA','JPR','VLP','IZA','GRP',
    'PMG','CFB','SJZ','MEA','GVR','POO','VAG','QSC',
    'SAO','RIO','BHZ'
  );