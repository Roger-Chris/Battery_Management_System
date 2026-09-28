import pybamm, numpy as np, json
out=json.load(open('/tmp/ref_dyn.json'))
prof=[]
for k in range(12):
    prof+= [10.0]*10+[0.0]*40+[-5.0]*10+[0.0]*40+[5.0]*120+[0.0]*60
prof=np.array(prof)
p=pybamm.ParameterValues("Chen2020")
p["Current function [A]"]="[input]"
model=pybamm.lithium_ion.DFN()
sim=pybamm.Simulation(model,parameter_values=p,solver=pybamm.IDAKLUSolver())
# piecewise constant: use experiment-like chaining
steps=[]
segs=[]
cur=prof[0];n=0
for x in prof:
    if x==cur:n+=1
    else: segs.append((cur,n));cur=x;n=1
segs.append((cur,n))
exp=pybamm.Experiment([pybamm.step.current(c,duration=n,period=1) if c!=0 else pybamm.step.rest(duration=n,period=1) for c,n in segs])
sim=pybamm.Simulation(pybamm.lithium_ion.DFN(),parameter_values=pybamm.ParameterValues("Chen2020"),experiment=exp)
s=sim.solve(initial_soc=0.95)
tt=s["Time [s]"].entries;vv=s["Voltage [V]"].entries
v1=np.interp(np.arange(len(prof)),tt,vv)
out['dfn_hppc']=v1.tolist();out['hppc_I']=prof.tolist()
json.dump(out,open('/tmp/ref_dyn.json','w'));print(len(v1),v1[:3],v1[-1])
