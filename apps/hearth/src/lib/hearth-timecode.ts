export function parseMinuteSecondTimecode(value:string):number|null{
 const match=value.trim().match(/^(\d+):([0-5]\d)$/);
 if(!match)return null;
 const minutes=Number(match[1]),seconds=Number(match[2]);
 if(!Number.isSafeInteger(minutes)||minutes<0)return null;
 const totalSeconds=minutes*60+seconds;
 return Number.isSafeInteger(totalSeconds)?totalSeconds*1000:null;
}

export function formatMinuteSecondTimecode(milliseconds:number):string{
 const totalSeconds=Math.max(0,Math.floor(milliseconds/1000));
 return `${Math.floor(totalSeconds/60)}:${String(totalSeconds%60).padStart(2,"0")}`;
}
