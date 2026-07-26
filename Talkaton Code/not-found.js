const cheeseAsk=document.getElementById("cheeseAsk");
const cheeseChoices=document.getElementById("cheeseChoices");
const yesCheese=document.getElementById("yesCheese");
const noCheese=document.getElementById("noCheese");
const cheeseReveal=document.getElementById("cheeseReveal");
const errorView=document.getElementById("errorView");
const dareView=document.getElementById("dareView");
const dareTitle=document.getElementById("dareTitle");
const reconsiderCheese=document.getElementById("reconsiderCheese");
const errorCard=document.getElementById("errorCard");
const secretView=document.getElementById("secretView");
const secretTitle=document.getElementById("secretTitle");
const joinDisco=document.getElementById("joinDisco");
const discoView=document.getElementById("discoView");
const discoTitle=document.getElementById("discoTitle");
const cheeseField=document.getElementById("cheeseField");
const musicStatus=document.getElementById("musicStatus");

const EASTER_EGG_DELAY=30000;
let musicContext;
let musicGain;
let musicTimer;
let musicStep=0;
let musicBar=0;
let nextMusicNote=0;
let noiseBuffer;

const DISCO_SONG=[
{
chord:[146.83,174.61,220,261.63],
bass:[73.42,146.83,110,130.81,73.42,146.83,110,130.81],
melody:[587.33,698.46,880,1046.5,880,698.46,659.25,587.33]
},
{
chord:[116.54,146.83,174.61,220],
bass:[58.27,116.54,87.31,110,58.27,116.54,87.31,110],
melody:[587.33,698.46,880,698.46,587.33,523.25,587.33,698.46]
},
{
chord:[130.81,164.81,196,246.94],
bass:[87.31,174.61,130.81,164.81,87.31,174.61,130.81,164.81],
melody:[440,523.25,698.46,880,783.99,698.46,523.25,440]
},
{
chord:[130.81,164.81,196,233.08],
bass:[65.41,130.81,98,116.54,65.41,130.81,98,116.54],
melody:[392,523.25,659.25,783.99,932.33,783.99,659.25,523.25]
},
{
chord:[146.83,174.61,220,261.63],
bass:[73.42,146.83,110,130.81,73.42,146.83,110,130.81],
melody:[587.33,698.46,880,1046.5,880,698.46,659.25,587.33]
},
{
chord:[116.54,146.83,174.61,220],
bass:[58.27,116.54,87.31,110,58.27,116.54,87.31,110],
melody:[698.46,587.33,466.16,587.33,698.46,880,698.46,587.33]
},
{
chord:[98,116.54,146.83,174.61],
bass:[98,196,146.83,174.61,98,196,146.83,174.61],
melody:[392,466.16,587.33,698.46,587.33,466.16,440,392]
},
{
chord:[110,138.59,164.81,196],
bass:[55,110,82.41,98,55,110,82.41,98],
melody:[440,554.37,659.25,783.99,659.25,554.37,440,null]
}
];

const secretTimer=window.setTimeout(()=>{
  if(!secretView||!errorView||!dareView||!discoView||!discoView.hidden)return;

  errorView.hidden=true;
  dareView.hidden=true;
  secretView.hidden=false;
  secretTitle?.focus();
},EASTER_EGG_DELAY);

cheeseAsk?.addEventListener("click",()=>{
cheeseAsk.hidden=true;
cheeseAsk.setAttribute("aria-expanded","true");
cheeseChoices.hidden=false;
yesCheese?.focus();
});

yesCheese?.addEventListener("click",()=>{
cheeseChoices.hidden=true;
cheeseReveal.hidden=false;
});

noCheese?.addEventListener("click",()=>{
errorView.hidden=true;
dareView.hidden=false;
dareTitle?.focus();
});

reconsiderCheese?.addEventListener("click",()=>{
dareView.hidden=true;
errorView.hidden=false;
cheeseReveal.hidden=true;
cheeseAsk.hidden=true;
cheeseAsk.setAttribute("aria-expanded","true");
cheeseChoices.hidden=false;
yesCheese?.focus();
});

function randomBetween(min,max){
return Math.random()*(max-min)+min;
}

function fillCheeseDisco(){
if(!cheeseField||cheeseField.childElementCount)return;

const screenArea=window.innerWidth*window.innerHeight;
const cheeseCount=Math.min(48,Math.max(30,Math.round(screenArea/21000)));
const fragment=document.createDocumentFragment();

for(let index=0;index<cheeseCount;index+=1){
const mover=document.createElement("span");
const cheese=document.createElement("span");

mover.className="cheeseMover";
cheese.className="dancingCheese";
cheese.textContent="🧀";

mover.style.setProperty("--x",`${randomBetween(1,96).toFixed(2)}%`);
mover.style.setProperty("--y",`${randomBetween(12,91).toFixed(2)}%`);
mover.style.setProperty("--size",`${randomBetween(28,62).toFixed(1)}px`);
mover.style.setProperty("--opacity",randomBetween(0.7,1).toFixed(2));
mover.style.setProperty("--from-x",`${randomBetween(-14,14).toFixed(2)}vw`);
mover.style.setProperty("--from-y",`${randomBetween(-10,10).toFixed(2)}vh`);
mover.style.setProperty("--to-x",`${randomBetween(-18,18).toFixed(2)}vw`);
mover.style.setProperty("--to-y",`${randomBetween(-14,14).toFixed(2)}vh`);
mover.style.setProperty("--drift-time",`${randomBetween(4.5,9.5).toFixed(2)}s`);
mover.style.setProperty("--dance-time",`${randomBetween(1.4,3.2).toFixed(2)}s`);
mover.style.setProperty("--delay",`${randomBetween(-8,0).toFixed(2)}s`);

mover.appendChild(cheese);
fragment.appendChild(mover);
}

cheeseField.appendChild(fragment);
}

function playTone(frequency,start,duration,type="sine",volume=0.1){
if(!musicContext||!musicGain)return;

const oscillator=musicContext.createOscillator();
const envelope=musicContext.createGain();
oscillator.type=type;
oscillator.frequency.setValueAtTime(frequency,start);
envelope.gain.setValueAtTime(0.0001,start);
envelope.gain.exponentialRampToValueAtTime(volume,start+0.012);
envelope.gain.exponentialRampToValueAtTime(0.0001,start+duration);
oscillator.connect(envelope);
envelope.connect(musicGain);
oscillator.start(start);
oscillator.stop(start+duration+0.02);
}

function playKick(start){
if(!musicContext||!musicGain)return;

const oscillator=musicContext.createOscillator();
const envelope=musicContext.createGain();
oscillator.type="sine";
oscillator.frequency.setValueAtTime(145,start);
oscillator.frequency.exponentialRampToValueAtTime(48,start+0.15);
envelope.gain.setValueAtTime(0.7,start);
envelope.gain.exponentialRampToValueAtTime(0.0001,start+0.19);
oscillator.connect(envelope);
envelope.connect(musicGain);
oscillator.start(start);
oscillator.stop(start+0.2);
}

function playHiHat(start,duration=0.055,volume=0.075){
if(!musicContext||!musicGain||!noiseBuffer)return;

const noise=musicContext.createBufferSource();
const filter=musicContext.createBiquadFilter();
const envelope=musicContext.createGain();
noise.buffer=noiseBuffer;
filter.type="highpass";
filter.frequency.value=5200;
envelope.gain.setValueAtTime(volume,start);
envelope.gain.exponentialRampToValueAtTime(0.0001,start+duration);
noise.connect(filter);
filter.connect(envelope);
envelope.connect(musicGain);
noise.start(start);
noise.stop(start+duration);
}

function playClap(start){
if(!musicContext||!musicGain||!noiseBuffer)return;

const noise=musicContext.createBufferSource();
const filter=musicContext.createBiquadFilter();
const envelope=musicContext.createGain();
noise.buffer=noiseBuffer;
filter.type="bandpass";
filter.frequency.value=1800;
filter.Q.value=0.7;
envelope.gain.setValueAtTime(0.12,start);
envelope.gain.exponentialRampToValueAtTime(0.0001,start+0.11);
noise.connect(filter);
filter.connect(envelope);
envelope.connect(musicGain);
noise.start(start);
noise.stop(start+0.12);
}

function playPad(notes,start){
if(!musicContext||!musicGain)return;

notes.forEach((frequency,index)=>{
const oscillator=musicContext.createOscillator();
const envelope=musicContext.createGain();
oscillator.type=index%2===0?"triangle":"sine";
oscillator.frequency.setValueAtTime(frequency,start);
oscillator.detune.value=index%2===0?-4:4;
envelope.gain.setValueAtTime(0.0001,start);
envelope.gain.exponentialRampToValueAtTime(0.022,start+0.12);
envelope.gain.setValueAtTime(0.022,start+1.45);
envelope.gain.exponentialRampToValueAtTime(0.0001,start+1.92);
oscillator.connect(envelope);
envelope.connect(musicGain);
oscillator.start(start);
oscillator.stop(start+1.95);
});
}

function playChordStab(notes,start){
notes.forEach((frequency,index)=>{
playTone(frequency*2,start,0.105,index%2===0?"sawtooth":"square",0.018);
});
}

function playLead(frequency,start){
if(!frequency)return;
playTone(frequency,start,0.22,"triangle",0.075);
playTone(frequency*2,start,0.16,"sine",0.018);
}

function scheduleDiscoStep(step,start,bar){
const songBar=DISCO_SONG[bar];

if(step%4===0)playKick(start);
if(step%2===1)playHiHat(start);
if(step===2||step===6||step===10||step===14)playHiHat(start,0.13,0.055);
if(step===4||step===12)playClap(start);

if(step%2===0){
const bassNote=songBar.bass[step/2];
playTone(bassNote,start,0.2,"triangle",0.11);
playTone(bassNote/2,start,0.18,"sine",0.035);
playLead(songBar.melody[step/2],start+0.012);
}

if(step===2||step===6||step===10||step===14){
playChordStab(songBar.chord,start);
}

if(step===0)playPad(songBar.chord,start);
}

function runMusicScheduler(){
if(!musicContext)return;

const sixteenthNote=60/118/4;
while(nextMusicNote<musicContext.currentTime+0.12){
scheduleDiscoStep(musicStep,nextMusicNote,musicBar);
nextMusicNote+=sixteenthNote;
musicStep+=1;
if(musicStep===16){
musicStep=0;
musicBar=(musicBar+1)%DISCO_SONG.length;
}
}
}

async function startDiscoMusic(){
const AudioEngine=window.AudioContext||window.webkitAudioContext;
if(!AudioEngine){
if(musicStatus)musicStatus.textContent="Your browser cannot play the disco music, but the cheese will still dance.";
return;
}

try{
musicContext=new AudioEngine();
musicGain=musicContext.createGain();
musicGain.gain.setValueAtTime(0.0001,musicContext.currentTime);
musicGain.gain.exponentialRampToValueAtTime(0.14,musicContext.currentTime+0.08);
musicGain.connect(musicContext.destination);

noiseBuffer=musicContext.createBuffer(1,Math.ceil(musicContext.sampleRate*0.18),musicContext.sampleRate);
const noiseData=noiseBuffer.getChannelData(0);
for(let index=0;index<noiseData.length;index+=1){
noiseData[index]=Math.random()*2-1;
}

await musicContext.resume();
musicStep=0;
musicBar=0;
nextMusicNote=musicContext.currentTime+0.03;
runMusicScheduler();
musicTimer=window.setInterval(runMusicScheduler,50);
if(musicStatus)musicStatus.textContent="Original disco tune: ON — melody, chords & groove";
}catch(error){
if(musicStatus)musicStatus.textContent="The music could not start, but the cheese will keep dancing.";
}
}

function stopDiscoMusic(){
window.clearInterval(musicTimer);
if(musicContext&&musicContext.state!=="closed")musicContext.close();
}

joinDisco?.addEventListener("click",()=>{
window.clearTimeout(secretTimer);
secretView.hidden=true;
errorCard.hidden=true;
discoView.hidden=false;
document.body.classList.add("discoMode");
fillCheeseDisco();
discoTitle?.focus();
startDiscoMusic();
});

window.addEventListener("pagehide",()=>{
window.clearTimeout(secretTimer);
stopDiscoMusic();
});
