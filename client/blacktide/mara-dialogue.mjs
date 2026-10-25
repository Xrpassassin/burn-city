// Branching introductory conversation. Choices are narrative previews, not granted reputation.
export const MARA_CHOICES=Object.freeze([
 {id:'honest-work',label:'I need honest work.',reply:'Then earn the trust of the harbor. Start by listening, not boasting.',faction:'gilded-exchange',reputationPreview:5},
 {id:'find-truth',label:'I want to know what happened to those ships.',reply:'Lower your voice. Meet the tavern keeper after sundown. Tell him Mara sent you.',faction:'ashen-veil',reputationPreview:5},
 {id:'defy-crown',label:'The Crown does not frighten me.',reply:'It should. Their officers have put better captains than you in chains.',faction:'iron-crown',reputationPreview:-5}
]);
export function maraChoice(id) {
 const found=MARA_CHOICES.find(c=>c.id===id);
 return found?{...found}:null;
}
