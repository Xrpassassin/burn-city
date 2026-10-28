// Pure cosmetic arrival / park / depart cycle. Inputs are seconds and must not affect physics.
export function beachVisitState(t,cycle=100){
 if(!Number.isFinite(t)||!Number.isFinite(cycle)||cycle<=0)return null;
 const v=((t%cycle)+cycle)%cycle;
 if(v<20)return {stage:'arrive',progress:v/20,visitor:0};
 if(v<24)return {stage:'exit',progress:1,visitor:(v-20)/4};
 if(v<75)return {stage:'beach',progress:1,visitor:1};
 if(v<80)return {stage:'return',progress:1,visitor:1-(v-75)/5};
 if(v<100)return {stage:'depart',progress:1-(v-80)/20,visitor:0};
 return null;
}
