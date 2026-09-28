import pybamm, numpy as np, json, time
out=json.load(open('/tmp/ref_dyn.json'))
def run_pc(prof, soc, model):
    segs=[];cur=prof[0];n=0
    for x in prof:
        if abs(x-cur)<1e-12:n+=1
        else: segs.append((cur,n));cur=x;n=1
    segs.append((cur,n))
    exp=pybamm.Experiment([pybamm.step.current(float(c),duration=int(n),period=0.5) if abs(c)>1e-12 else pybamm.step.rest(duration=int(n),period=0.5) for c,n in segs])
    sim=pybamm.Simulation(model,parameter_values=pybamm.ParameterValues("Chen2020"),experiment=exp)
    s=sim.solve(initial_soc=soc)
    tt=s["Time [s]"].entries;vv=s["Voltage [V]"].entries
    # sample mid-step (t+0.5) where current is unambiguous
    return np.interp(np.arange(len(prof))+0.5,tt,vv).tolist()
t0=time.time()
out['dfn_hppc']=run_pc(np.array(out['hppc_I']),0.95,pybamm.lithium_ion.DFN())
print('hppc',time.time()-t0)
wm=np.round(np.array(json.load(open('/tmp/wmtc_cell_current.json'))),3)
json.dump(wm.tolist(),open('/tmp/wmtc_cell_current.json','w'))
t0=time.time()
out['dfn']=run_pc(wm,0.9,pybamm.lithium_ion.DFN());print('dfn',time.time()-t0)
out['spm']=run_pc(wm,0.9,pybamm.lithium_ion.SPM());print('spm',time.time()-t0)
json.dump(out,open('/tmp/ref_dyn.json','w'))
