import pybamm, numpy as np, json, csv
pv = pybamm.ParameterValues("Chen2020")
# stoichiometry limits (2.5-4.2 V window)
esoh = pybamm.lithium_ion.ElectrodeSOHSolver(pv, param=pybamm.LithiumIonParameters())
Vmin, Vmax = 2.5, 4.2
Q_n = pv.evaluate(pybamm.LithiumIonParameters().n.Q_init)
Q_p = pv.evaluate(pybamm.LithiumIonParameters().p.Q_init)
Q_Li = pv.evaluate(pybamm.LithiumIonParameters().Q_Li_particles_init)
sol = esoh.solve({"Q_n":Q_n,"Q_p":Q_p,"Q_Li":Q_Li,"V_min":Vmin,"V_max":Vmax})
lim = {k: float(sol[k]) for k in ["x_0","x_100","y_0","y_100","Q"]}
print(lim)
out={"lim":lim}
def run(model, current_fn, t_end, dt=1.0, T=298.15, soc=1.0):
    p = pybamm.ParameterValues("Chen2020")
    p["Current function [A]"] = current_fn
    p["Ambient temperature [K]"]=T; p["Initial temperature [K]"]=T
    sim = pybamm.Simulation(model, parameter_values=p, solver=pybamm.IDAKLUSolver())
    s = sim.solve([0,t_end], t_interp=np.arange(0,t_end+dt,dt), initial_soc=soc)
    return s["Time [s]"].entries.tolist(), s["Voltage [V]"].entries.tolist()
# 1C CC discharge
for name, mdl in [("spm",pybamm.lithium_ion.SPM()),("dfn",pybamm.lithium_ion.DFN())]:
    t,v = run(mdl, 5.0, 3500, dt=5)
    out[name+"_1C"]={"t":t,"v":v}
    t,v = run(mdl, 10.0, 1750, dt=5)
    out[name+"_2C"]={"t":t,"v":v}
    print(name, len(t), v[0], v[-1])
json.dump(out, open("ref.json","w"))
