(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const definitions = [
    {key:"Age", label:"Age", unit:"years", min:30, max:79, step:1, example:50},
    {key:"Education", label:"Education", options:[[1,"Below high school"],[2,"High school"],[3,"Above high school"]], example:3},
    {key:"Glucose", label:"Glucose", unit:"mg/dL", min:38, max:470, step:1, example:101},
    {key:"SBP", label:"Systolic blood pressure", short:"Systolic BP", unit:"mmHg", min:90, max:180, step:1, example:122},
    {key:"CKM", label:"CKM stage", options:[0,1,2,3].map(n=>[n,"Stage "+n]), example:2},
    {key:"Smoking", label:"Smoking status", short:"Smoking", options:[[0,"Never"],[1,"Former"],[2,"Current"]], example:0},
    {key:"Triglyceride", label:"Triglycerides", unit:"mg/dL", min:10, max:1651, step:1, example:107},
    {key:"UricAcid", label:"Uric acid", unit:"mg/dL", min:0.4, max:11.3, step:0.1, example:5.3},
    {key:"eGFR", label:"eGFR", unit:"mL/min/1.73 m²", min:16, max:139, step:1, example:96},
    {key:"ABSI", label:"A Body Shape Index", short:"ABSI", unit:"raw ABSI", min:0.065386911, max:0.100509748, step:0.00001, example:0.081780293}
  ];
  if (!window.CKMEngine || !window.CKMNomogram || definitions.some((d,i)=>d.key!==CKMEngine.featureNames[i])) {
    $("edit-status").textContent="The calculator could not load. Reload this page.";
    $("form").querySelector('button[type="submit"]').disabled=true;
    return;
  }
  const byKey=Object.fromEntries(definitions.map(d=>[d.key,d]));
  const data={
    Allcause:{name:"All-cause mortality",title:"CKM-Allcause"},
    CVD:{name:"Cardiovascular mortality",title:"CKM-CardiovascularDeath"}
  };
  const defaults=definitions.map(d=>d.example);
  const profiles=[{name:"Example profile",values:defaults}];
  let current=0;
  function requestedEndpoint() {
    const directory=location.pathname.replace(/\/index\.html$/, "/").split("/").filter(Boolean).pop();
    for(const [key,outcome] of Object.entries(data)){
      if(directory===outcome.title)return key;
    }
    const key=(new URLSearchParams(location.search).get("outcome")||location.hash.slice(1)).toLowerCase();
    return key==="cvd"?"CVD":"Allcause";
  }
  let endpoint=requestedEndpoint(),shown="graph";
  function el(tag,text,cls) {
    const a=document.createElement(tag);
    if (text!==undefined && text!==null) a.textContent=text;
    if (cls) a.className=cls;
    return a;
  }
  function valueLabel(d,v) {
    if (d.options) return d.options.find(o=>o[0]===v)[1];
    if (d.key==="ABSI") return v.toFixed(6);
    return String(v);
  }
  function field(key) {
    const d=byKey[key],id="v-"+key;
    const label=el("label", d.label);
    label.htmlFor=id;
    if(d.options){
      const box=el("div",null,"cat"+(key==="Education"?" wide":""));
      const select=el("select");select.id=id;select.name=key;
      for(const [v,t] of d.options)select.append(new Option(t,String(v)));
      select.value=String(d.example);
      select.addEventListener("change",pending);
      box.append(label,select);
      return box;
    }
    const box=el("div",null,"field"), row=el("div",null,"field-row"), num=el("input"), range=el("input",null,"range");
    label.append(document.createTextNode(" "),el("span",d.unit,"unit"));
    num.type="number";num.required=true;num.name=key;num.id=id;num.step="any";
    num.className=d.key==="ABSI"?"number wide":"number";
    num.value=String(d.example);num.inputMode="decimal";
    range.type="range";range.id="slider-"+key;range.min=d.min;range.max=d.max;range.step=d.step;range.value=d.example;
    range.setAttribute("aria-label",d.label+" slider, "+d.unit);
    const note=el("div",null,"range-note");note.id="note-"+key;note.hidden=true;
    num.setAttribute("aria-describedby",note.id);
    num.addEventListener("input",()=>{
      if (Number.isFinite(num.valueAsNumber)) range.value=num.value;
      validateNumber(d);
      pending();
    });
    range.addEventListener("input",()=>{
      let v=range.valueAsNumber;
      if(key==="ABSI")v=Number(v.toFixed(9));
      num.value=String(v);validateNumber(d);pending();
    });
    row.append(label,num);box.append(row,range,note);
    return box;
  }
  function validateNumber(d) {
    const inp=$("v-"+d.key),note=$("note-"+d.key),v=inp.valueAsNumber;
    const invalid=inp.value!=="" && (!Number.isFinite(Math.fround(v)) || v<0 || (["Age","ABSI"].includes(d.key) && v===0));
    inp.setCustomValidity(invalid?"Enter a valid positive measurement.":"");
    const outside=!invalid && Number.isFinite(v) && (v<d.min || v>d.max);
    note.hidden=!outside;
    note.textContent=outside?"Outside the training range ("+d.min+"–"+d.max+").":"";
  }
  function buildForm(){
    const top=el("div",null,"controls");top.append(field("ABSI"),field("Age"));
    const cats=el("div",null,"cats");cats.append(field("CKM"),field("Smoking"),field("Education"));top.append(cats);
    const labs=el("div",null,"controls");
    for(const k of ["SBP","Glucose","Triglyceride","UricAcid","eGFR"])labs.append(field(k));
    $("fields").replaceChildren(top,labs);
  }
  function values(){return definitions.map(d=>{const n=$("v-"+d.key);return d.options?Number(n.value):n.valueAsNumber;});}
  function matches(a,b){return a.every((v,i)=>v===b[i]);}
  function pending(){
    const dirty=!matches(values(),profiles[current].values);
    $("edit-status").textContent=dirty?"Inputs changed. Select Predict.":"";
  }
  function writeProfile(i){
    current=i;
    definitions.forEach((d,j)=>{
      const v=profiles[i].values[j];$("v-"+d.key).value=String(v);
      if(!d.options){$("slider-"+d.key).value=v;validateNumber(d);}
    });
    pending();
  }
  function pct(x){return (100*x).toFixed(2)+"%";}
  function score(p){return CKMEngine.predict(endpoint,p.values);}
  function table(headers,rows){
    const outer=el("div",null,"scroller"),t=el("table",null,"data"),head=t.createTHead().insertRow();
    headers.forEach(s=>{const th=el("th",s);th.scope="col";head.append(th);});
    const body=t.createTBody();
    rows.forEach(r=>{const row=body.insertRow();r.forEach((s,i)=>{const c=el(i===0?"th":"td",s);if(!i)c.scope="row";row.append(c);});});
    outer.append(t);return outer;
  }
  function numerical(){
    const sel=el("select");sel.id="history";profiles.forEach((p,i)=>sel.append(new Option(p.name,String(i))));sel.value=String(current);
    sel.addEventListener("change",()=>{writeProfile(Number(sel.value));render();});
    const section=el("div"),wrap=el("div",null,"profile-choose"),label=el("label","View profile");label.htmlFor=sel.id;
    wrap.append(label,sel);
    section.append(table(["Profile",data[endpoint].name],profiles.map(p=>[p.name,pct(score(p).probability)])),wrap,
      table(["Predictor","Submitted value"],definitions.map((d,i)=>[d.label,valueLabel(d,profiles[current].values[i])+(d.unit && d.key!=="ABSI"?" "+d.unit:"")])));
    $("numerical-table").replaceChildren(section);
  }
  function render(){
    document.querySelectorAll("[data-end]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.end===endpoint)));
    const p=profiles[current],result=score(p);
    $("estimate-label").textContent=data[endpoint].name;$("probability").textContent=pct(result.probability);
    $("profile-label").textContent=p.name;$("risk-mark").style.left=(100*result.probability)+"%";
    CKMNomogram.render($("nomogram"),result,definitions.map((d,i)=>({label:d.label,short:d.short||d.label,valueLabel:valueLabel(d,p.values[i])})));
    numerical();
    document.title=data[endpoint].title;
    $("page-title").textContent=data[endpoint].title;
  }
  function tab(key,focus){
    shown=key;
    document.querySelectorAll("[data-tab]").forEach(b=>{
      const selected=b.dataset.tab===key;b.setAttribute("aria-selected",selected);b.tabIndex=selected?0:-1;
      $(b.dataset.tab).hidden=!selected;if(selected && focus)b.focus();
    });
  }
  document.querySelectorAll("[data-tab]").forEach(b=>{
    b.addEventListener("click",()=>tab(b.dataset.tab,false));
    b.addEventListener("keydown",e=>{
      const ids=["graph","numeric"],i=ids.indexOf(shown);
      const other=1-i;
      const moves={ArrowRight:other,ArrowLeft:other,Home:0,End:1};
      if(e.key in moves){e.preventDefault();tab(ids[moves[e.key]],true);}
    });
  });
  document.querySelectorAll("[data-end]").forEach(b=>b.addEventListener("click",()=>{
    endpoint=b.dataset.end;
    const u=new URL(location.href);
    if (/\/CKM-(Allcause|CardiovascularDeath)(?:\/index\.html|\/)?$/.test(u.pathname)) {
      u.pathname=u.pathname.replace(/CKM-(Allcause|CardiovascularDeath)(?:\/index\.html|\/)?$/,data[endpoint].title+"/");
      u.searchParams.delete("outcome");
    } else {
      u.searchParams.set("outcome",endpoint.toLowerCase());
    }
    u.hash="";
    try{history.replaceState(null,"",u.href);}catch(_){/* local file viewers may restrict history. */}
    render();pending();
  }));
  $("form").addEventListener("submit",e=>{
    e.preventDefault();
    const v=values();let i=profiles.findIndex(p=>matches(p.values,v));
    if(i<0){i=profiles.length;profiles.push({name:"Profile "+i,values:v});}
    current=i;render();tab("graph",false);
    $("edit-status").textContent="Prediction updated.";
    if(window.matchMedia("(max-width:760px)").matches)$("tab-graph").scrollIntoView({block:"start"});
  });
  $("reset").addEventListener("click",()=>{writeProfile(0);render();$("edit-status").textContent="Example inputs restored.";});
  $("print").addEventListener("click",()=>window.print());
  window.addEventListener("popstate",()=>{endpoint=requestedEndpoint();render();});
  buildForm();render();
})();
