const exceptions={"Shepherd's Pie":"Shepherds Pie.png","Caffè Latte":"Caffe Latte.png","Caffè Mocha":"Caffe Mocha.png"};
export function iconUrl(nameEn){if(!nameEn)return"";const fileName=exceptions[nameEn]??`${nameEn}.png`;return`https://hayday.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(fileName)}`}
