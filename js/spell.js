/* The Signature Spell Check — learning engine.
   Remembers YOUR patterns on YOUR device (personal dictionary, accepted
   corrections, word usage). Shared background-compiled patterns in
   data/compiled-patterns.json improve suggestions for everyone.
   Personal words never leave the device. */
(function(){
"use strict";
/* ---------- tiny storage ---------- */
var LS={
  get:function(k,d){try{var v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}},
  set:function(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
};
var personal=new Set(LS.get("sigspell.personal",[]));   // user's own words
var corrmem=LS.get("sigspell.corrections",{});          // misspelled -> word user picked
var usefreq=LS.get("sigspell.usefreq",{});              // word -> times user typed it
function saveLearn(){
  LS.set("sigspell.personal",Array.from(personal).slice(0,5000));
  LS.set("sigspell.corrections",corrmem);
  LS.set("sigspell.usefreq",usefreq);
}
var WORDS=null, FREQ={}, PAIRS={};
var loading=null;
function ensureData(){
  if(WORDS)return Promise.resolve(true);
  if(loading)return loading;
  /* offline single-file build: wordlist embedded by code/build_offline.py */
  if(window.OFFLINE_WORDS){
    WORDS=new Set(window.OFFLINE_WORDS.split("\n"));
    personal.forEach(function(w){WORDS.add(w);});
    FREQ=window.OFFLINE_FREQ||{};PAIRS=window.OFFLINE_PAIRS||{};
    return Promise.resolve(true);
  }
  loading=Promise.all([
    fetch("data/words.txt").then(function(r){if(!r.ok)throw new Error("words");return r.text();}),
    fetch("data/compiled-patterns.json").then(function(r){return r.ok?r.json():{};}).catch(function(){return {};})
  ]).then(function(out){
    WORDS=new Set(out[0].split(/\s+/).filter(Boolean));
    personal.forEach(function(w){WORDS.add(w);});
    FREQ=out[1].freq||{}; PAIRS=out[1].pairs||{};
    return true;
  }).catch(function(){loading=null;return false;});
  return loading;
}
function norm(w){return String(w||"").toLowerCase();}
function isWord(w){
  w=norm(w);if(!w)return true;
  return WORDS.has(w)||personal.has(w);
}
/* ---------- suggestion engine (Norvig-style, frequency ranked) ---------- */
var ALPHA="abcdefghijklmnopqrstuvwxyz";
function edits1(w){
  var out=[],i,a,b;
  for(i=0;i<w.length;i++){out.push(w.slice(0,i)+w.slice(i+1));}                       // delete
  for(i=0;i<w.length-1;i++){out.push(w.slice(0,i)+w[i+1]+w[i]+w.slice(i+2));}         // transpose
  for(i=0;i<w.length;i++){for(a=0;a<26;a++){out.push(w.slice(0,i)+ALPHA[a]+w.slice(i+1));}} // replace
  for(i=0;i<=w.length;i++){for(a=0;a<26;a++){out.push(w.slice(0,i)+ALPHA[a]+w.slice(i));}} // insert
  return out;
}
function rank(cands,orig){
  var seen={},list=[];
  cands.forEach(function(c){
    if(c===orig||seen[c])return;seen[c]=1;
    var f=(FREQ[c]||0)*3+(usefreq[c]||0)*5;
    list.push([c,f]);
  });
  list.sort(function(x,y){return (y[1]-x[1])||(x[0].length-y[0].length)||(x[0]<y[0]?-1:1);});
  return list.map(function(x){return x[0];});
}
function suggest(w,limit){
  limit=limit||8;w=norm(w);
  if(!WORDS||!w||isWord(w))return [];
  var out=[];
  if(corrmem[w]&&isWord(corrmem[w]))out.push(corrmem[w]);   // user's own past pick first
  if(PAIRS[w]&&isWord(PAIRS[w])&&out.indexOf(PAIRS[w])<0)out.push(PAIRS[w]); // background-compiled pair
  var e1=rank(edits1(w).filter(isWord),w);
  e1.forEach(function(c){if(out.indexOf(c)<0)out.push(c);});
  if(out.length<limit&&w.length<=9){                        // limited edits2
    var e2=[],seen={};
    var ones=edits1(w);
    for(var i=0;i<ones.length&&e2.length<400;i++){
      var sub=edits1(ones[i]);
      for(var j=0;j<sub.length&&e2.length<400;j++){
        var c=sub[j];
        if(!seen[c]&&isWord(c)&&c!==w){seen[c]=1;e2.push(c);}
      }
    }
    rank(e2,w).forEach(function(c){if(out.indexOf(c)<0)out.push(c);});
  }
  return out.slice(0,limit);
}
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
/* ---------- tokenize with positions ---------- */
function tokens(text){
  var out=[],re=/[A-Za-z][A-Za-z']*/g,m;
  while((m=re.exec(text)))out.push({w:m[0],i:m.index});
  return out;
}
function learnUsage(text){
  var changed=false;
  tokens(text).forEach(function(t){
    var w=norm(t.w).replace(/'+$/,"");
    if(w.length>1){usefreq[w]=(usefreq[w]||0)+1;changed=true;}
  });
  if(changed)saveLearn();
}
/* ---------- overlay live check ---------- */
var docEl=null,ovEl=null,paintT=null;
function paintOverlay(){
  if(!docEl||!ovEl||!WORDS)return;
  var text=docEl.value,html="",last=0;
  tokens(text).forEach(function(t){
    var w=t.w.replace(/'+$/,"");
    html+=esc(text.slice(last,t.i));
    if(w&&!isWord(w))html+='<span class="mis" data-w="'+esc(w)+'">'+esc(t.w)+"</span>";
    else html+=esc(t.w);
    last=t.i+t.w.length;
  });
  html+=esc(text.slice(last));
  ovEl.innerHTML=html||" ";
  ovEl.scrollTop=docEl.scrollTop;
  updateStats(text);
}
function schedulePaint(){clearTimeout(paintT);paintT=setTimeout(paintOverlay,180);}
function updateStats(text){
  var el=document.getElementById("docstats");if(!el||!WORDS)return;
  var ts=tokens(text),bad=0;
  ts.forEach(function(t){var w=t.w.replace(/'+$/,"");if(w&&!isWord(w))bad++;});
  el.textContent=ts.length+" words · "+bad+" flagged · "+personal.size+" in your dictionary";
}
/* ---------- suggestion popup ---------- */
var pop=null,popWord=null;
function closePop(){if(pop)pop.style.display="none";popWord=null;}
function openPop(word,anchorRect){
  popWord=word;
  var sugs=suggest(word,6);
  var h='<h4>“'+esc(word)+'”</h4>';
  if(!sugs.length)h+='<div style="font-size:.85em;color:#6f6a5e">No suggestions — add it to your dictionary if it is correct.</div>';
  sugs.forEach(function(s){h+='<span class="sug" data-s="'+esc(s)+'">'+esc(s)+"</span>";});
  h+='<div class="acts"><button data-a="ignore">Ignore</button><button data-a="add">Add to dictionary</button></div>';
  pop.innerHTML=h;
  pop.style.display="block";
  var r=anchorRect,x=Math.min(r.left,innerWidth-300),y=r.bottom+scrollY+6;
  pop.style.left=Math.max(8,x)+"px";pop.style.top=y+"px";
}
function applyCorrection(orig,repl){
  if(!docEl)return;
  var w=norm(orig);
  corrmem[w]=norm(repl);                       // remember: user picked repl for w
  usefreq[norm(repl)]=(usefreq[norm(repl)]||0)+3;
  saveLearn();
  var re=new RegExp("\\b"+orig.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b");
  docEl.value=docEl.value.replace(re,repl);
  paintOverlay();closePop();
}
/* ---------- Word-style Check Document dialog ---------- */
var dlg=null,dlgBack=null,queue=[],qi=0,ignoreAll={},changeAll={},undoStack=[];
function sentenceOf(text,idx){
  var s=Math.max(0,text.lastIndexOf(".",idx-80),text.lastIndexOf("!",idx-80),
                   text.lastIndexOf("?",idx-80),text.lastIndexOf("\n",idx-80));
  var e=text.indexOf(".",idx);var e2=text.indexOf("!",idx);var e3=text.indexOf("?",idx);
  e=[e,e2,e3].filter(function(x){return x>idx;});
  e=e.length?Math.min.apply(null,e):Math.min(idx+80,text.length);
  return text.slice(s,e+1).trim();
}
function buildQueue(){
  queue=[];ignoreAll={};changeAll={};
  if(!docEl||!WORDS)return;
  var text=docEl.value,seen={};
  tokens(text).forEach(function(t){
    var w=t.w.replace(/'+$/,""),lw=norm(w);
    if(!w||isWord(w)||seen[lw])return;
    seen[lw]=1;
    queue.push({w:w,lw:lw,ctx:sentenceOf(text,t.i)});
  });
}
function dlgShow(){
  buildQueue();qi=0;undoStack=[];
  if(!queue.length){flashBar("No misspellings found — nice work.");return;}
  dlgBack.style.display="flex";dlgStep();
}
function dlgStep(){
  while(qi<queue.length&&(ignoreAll[queue[qi].lw]||isWord(queue[qi].w)))qi++;
  if(qi>=queue.length){dlgBack.style.display="none";paintOverlay();flashBar("Document check complete.");return;}
  var q=queue[qi],sugs=suggest(q.w,7);
  var h='<h3>Not in dictionary: <span style="color:#c62f2f">“'+esc(q.w)+'”</span></h3>';
  h+='<div class="ctx">'+esc(q.ctx).replace(new RegExp("("+q.w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+")","i"),'<span class="hl">$1</span>')+"</div>";
  h+='<div class="suglist">';
  if(!sugs.length)h+='<div style="font-size:.9em;color:#6f6a5e">No suggestions.</div>';
  sugs.forEach(function(s,i){h+='<span class="sug'+(i===0?" sel":"")+'" data-s="'+esc(s)+'">'+esc(s)+"</span>";});
  h+="</div>";
  h+='<div class="btnrow"><button class="btn" data-d="change">Change</button>'
    +'<button class="btn ghost" data-d="changeall">Change All</button>'
    +'<button class="btn ghost" data-d="ignore">Ignore</button>'
    +'<button class="btn ghost" data-d="ignoreall">Ignore All</button>'
    +'<button class="btn gold" data-d="add">Add to Dictionary</button></div>'
    +'<div class="btnrow"><button class="btn ghost" data-d="undo">Undo last</button>'
    +'<button class="btn ghost" data-d="close">Close</button>'
    +'<span style="align-self:center;font-size:.85em;color:#6f6a5e">'+(qi+1)+" of "+queue.length+"</span></div>";
  dlg.innerHTML=h;
}
function dlgAction(a,selSug){
  var q=queue[qi];if(!q)return;
  function sel(){var el=dlg.querySelector(".sug.sel");return el?el.getAttribute("data-s"):(selSug||"");}
  if(a==="change"||a==="changeall"){
    var s=sel();if(!s){flashBar("Pick a suggestion first.");return;}
    undoStack.push(docEl.value);
    var re=new RegExp("\\b"+q.w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b",(a==="changeall"?"g":""));
    docEl.value=docEl.value.replace(re,s);
    corrmem[q.lw]=norm(s);usefreq[norm(s)]=(usefreq[norm(s)]||0)+3;saveLearn();
    if(a==="changeall")changeAll[q.lw]=s;
    qi++;dlgStep();
  }else if(a==="ignore"){qi++;dlgStep();}
  else if(a==="ignoreall"){ignoreAll[q.lw]=1;qi++;dlgStep();}
  else if(a==="add"){addPersonal(q.w);qi++;dlgStep();}
  else if(a==="undo"){if(undoStack.length){docEl.value=undoStack.pop();paintOverlay();}dlgStep();}
  else if(a==="close"){dlgBack.style.display="none";paintOverlay();}
}
function addPersonal(w){
  w=norm(w).replace(/'+$/,"");if(!w)return;
  personal.add(w);if(WORDS)WORDS.add(w);saveLearn();paintOverlay();
}
var barT=null;
function flashBar(msg){
  var el=document.getElementById("flash");if(!el)return;
  el.textContent=msg;el.style.display="block";
  clearTimeout(barT);barT=setTimeout(function(){el.style.display="none";},3500);
}
/* ---------- AutoCorrect ---------- */
var AUTOC={teh:"the",adn:"and",recieve:"receive",seperate:"separate",occured:"occurred",
definately:"definitely",goverment:"government",wich:"which",thier:"their",beleive:"believe",
untill:"until",happend:"happened",writting:"writing",neccessary:"necessary",tommorrow:"tomorrow",
freind:"friend",becuase:"because",exmaple:"example",langauge:"language",knowlege:"knowledge",
busines:"business",calender:"calendar",cemetary:"cemetery",changable:"changeable",
collegue:"colleague",comming:"coming",compair:"compare",dissapear:"disappear",enviroment:"environment",
exagerate:"exaggerate",existense:"existence",experiance:"experience",finaly:"finally",
foriegn:"foreign",governer:"governor",grammer:"grammar",harrass:"harass",immediatly:"immediately",
independant:"independent",juge:"judge",lenght:"length",liason:"liaison",libary:"library",
managment:"management",millenium:"millennium",miniscule:"minuscule",mispell:"misspell",
noticable:"noticeable",ocassion:"occasion",persistant:"persistent",playwrite:"playwright",
posession:"possession",prefered:"preferred",publically:"publicly",realy:"really",
refered:"referred",relevent:"relevant",rythm:"rhythm",sieze:"seize",suprise:"surprise",
tatoo:"tattoo",tendancy:"tendency",truely:"truly",useage:"usage",vaccum:"vacuum",
villian:"villain",warrent:"warrant",wierd:"weird",writen:"written"};
var acOn=LS.get("sigspell.autocorrect",true);
/* ---------- wiring ---------- */
function onReady(){
  pop=document.getElementById("sugpop");
  dlg=document.getElementById("dlg");dlgBack=document.getElementById("dlg-back");
  docEl=document.getElementById("doc");ovEl=document.getElementById("overlay");
  ensureData().then(function(ok){
    if(!ok){flashBar("Word list failed to load — check your connection and reload.");return;}
    if(docEl){paintOverlay();
      docEl.addEventListener("input",function(ev){
        if(acOn&&/ $/.test(docEl.value)&&ev.inputType==="insertText"){
          var m=docEl.value.slice(0,-1).match(/([A-Za-z']+)$/);
          if(m){var lw=norm(m[1]);
            if(AUTOC[lw]&&!isWord(m[1])){
              var pos=docEl.selectionStart;
              docEl.value=docEl.value.slice(0,-(m[1].length+1))+AUTOC[lw]+" ";
              docEl.selectionStart=docEl.selectionEnd=pos-(m[1].length-AUTOC[lw].length);
              corrmem[lw]=AUTOC[lw];saveLearn();
            }
          }
        }
        learnUsageThrottled();schedulePaint();
      });
      docEl.addEventListener("scroll",function(){if(ovEl)ovEl.scrollTop=docEl.scrollTop;});
    }
    paintOverlay();
  });
  /* overlay word tap -> popup */
  document.addEventListener("click",function(ev){
    var t=ev.target;
    if(t.classList&&t.classList.contains("mis")){
      ensureData().then(function(){openPop(t.getAttribute("data-w"),t.getBoundingClientRect());});
      return;
    }
    if(pop&&pop.style.display==="block"){
      if(t.classList&&t.classList.contains("sug")&&pop.contains(t)){
        applyCorrection(popWord,t.getAttribute("data-s"));return;
      }
      var b=t.closest?t.closest("[data-a]"):null;
      if(b&&pop.contains(b)){
        var a=b.getAttribute("data-a");
        if(a==="ignore")closePop();
        else if(a==="add"){addPersonal(popWord);closePop();flashBar("“"+popWord+"” added to your dictionary.");}
        return;
      }
      if(!pop.contains(t))closePop();
    }
    var d=t.closest?t.closest("[data-d]"):null;
    if(d&&dlg.contains(d)){
      var selEl=d.classList.contains("sug")?d:null;
      if(selEl){dlg.querySelectorAll(".sug").forEach(function(x){x.classList.remove("sel");});selEl.classList.add("sel");return;}
      dlgAction(d.getAttribute("data-d"));
    }
  });
  /* type bar */
  var tb=document.getElementById("typebar"),go=document.getElementById("typego"),res=document.getElementById("typeresult");
  function checkBar(){
    var w=(tb.value||"").trim();if(!w)return;
    ensureData().then(function(ok){
      if(!ok){res.className="result bad";res.innerHTML="Word list failed to load — check your connection and reload.";return;}
      var lw=norm(w).replace(/'+$/,"");
      if(isWord(w)){
        usefreq[lw]=(usefreq[lw]||0)+1;saveLearn();
        res.className="result ok";res.innerHTML="<b>“"+esc(w)+"”</b> is spelled correctly.";
      }else{
        var sugs=suggest(w,8),h='<b>“'+esc(w)+'”</b> is not in the dictionary. ';
        if(sugs.length){h+="Did you mean:<br>";
          sugs.forEach(function(s){h+='<span class="sug" data-bw="'+esc(s)+'">'+esc(s)+"</span>";});}
        else h+="No suggestions — if it is right, add it below.";
        h+='<div class="btnrow"><button class="btn gold" id="tbadd" style="padding:8px 14px;font-size:.9em">Add “'+esc(w)+'” to my dictionary</button></div>';
        res.className="result bad";res.innerHTML=h;
        res.querySelectorAll("[data-bw]").forEach(function(el){
          el.addEventListener("click",function(){
            corrmem[lw]=norm(el.getAttribute("data-bw"));saveLearn();
            tb.value=el.getAttribute("data-bw");checkBar();
          });
        });
        var ab=document.getElementById("tbadd");
        if(ab)ab.addEventListener("click",function(){addPersonal(w);checkBar();flashBar("Added to your dictionary.");});
      }
    });
  }
  if(go)go.addEventListener("click",checkBar);
  if(tb)tb.addEventListener("keydown",function(e){if(e.key==="Enter")checkBar();});
  /* buttons */
  var cd=document.getElementById("checkdoc");
  if(cd)cd.addEventListener("click",function(){ensureData().then(function(ok){if(!ok){flashBar("Word list failed to load — check your connection and reload.");return;}dlgShow();});});
  var ac=document.getElementById("actoggle");
  if(ac){ac.checked=acOn;ac.addEventListener("change",function(){acOn=ac.checked;LS.set("sigspell.autocorrect",acOn);});}
  var pd=document.getElementById("persbtn"),pl=document.getElementById("perslist");
  if(pd)pd.addEventListener("click",function(){
    if(!pl)return;
    if(pl.style.display==="block"){pl.style.display="none";return;}
    var arr=Array.from(personal).sort(),h="";
    if(!arr.length)h='<div style="font-size:.9em;color:#6f6a5e">Your dictionary is empty. Words you add while checking will live here, on this device only.</div>';
    arr.forEach(function(w){h+='<span class="pw">'+esc(w)+' <button data-rm="'+esc(w)+'" aria-label="remove">×</button></span>';});
    pl.innerHTML=h;pl.style.display="block";
    pl.querySelectorAll("[data-rm]").forEach(function(b){
      b.addEventListener("click",function(){
        personal.delete(b.getAttribute("data-rm"));
        if(WORDS)WORDS.delete(b.getAttribute("data-rm"));
        saveLearn();pd.click();pd.click();paintOverlay();
      });
    });
  });
  var ex=document.getElementById("exportbtn");
  if(ex)ex.addEventListener("click",function(){
    var blob=new Blob([Array.from(personal).sort().join("\n")],{type:"text/plain"});
    var a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download="my-signature-words.txt";document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},500);
  });
}
var learnT=null;
function learnUsageThrottled(){clearTimeout(learnT);learnT=setTimeout(function(){if(docEl)learnUsage(docEl.value);},4000);}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",onReady);
else onReady();
/* public API for other pages */
window.SigSpell={ensureData:ensureData,isWord:isWord,suggest:suggest,addPersonal:addPersonal,
  personal:function(){return Array.from(personal).sort();},count:function(){return WORDS?WORDS.size:0;}};
})();
