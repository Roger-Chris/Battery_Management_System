import pybamm, numpy as np, json
I=np.array(json.load(open('/tmp/wmtc_cell_current.json')))
t=np.arange(len(I),dtype=float)
out={}
for name,mdl in [("spm",pybamm.lithium_ion.SPM()),("dfn",pybamm.lithium_ion.DFN())]:
    p=pybamm.ParameterValues("Chen2020")
    p["Current function [A]"]=pybamm.Interpolant(t,I,pybamm.t,interpolator="linear")
    sim=pybamm.Simulation(mdl,parameter_values=p,solver=pybamm.IDAKLUSolver())
    s=sim.solve([0,t[-1]],t_interp=t,initial_soc=0.9)
    out[name]=s["Voltage [V]"].entries.tolist()
    print(name,len(out[name]))
# HPPC-like pulses for fitting dynamics
prof=[]
for k in range(12):
    prof+= [10.0]*10+[0.0]*40+[-5.0]*10+[0.0]*40+[5.0]*120+[0.0]*60
prof=np.array(prof);tp=np.arange(len(prof),dtype=float)
for name,mdl in [("dfn_hppc",pybamm.lithium_ion.DFN())]:
    p=pybamm.ParameterValues("Chen2020")
    p["Current function [A]"]=pybamm.Interpolant(tp,prof,pybamm.t,interpolator="linear")
    sim=pybamm.Simulation(mdl,parameter_values=p,solver=pybamm.IDAKLUSolver())
    s=sim.solve([0,tp[-1]],t_interp=tp,initial_soc=0.95)
    out[name]=s["Voltage [V]"].entries.tolist(); out['hppc_I']=prof.tolist()
    print(name,len(out[name]))
json.dump(out,open('/tmp/ref_dyn.json','w'))
