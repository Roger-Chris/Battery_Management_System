import pybamm, numpy as np, json
m=pybamm.lithium_ion.DFN(options={"thermal":"lumped"})
p=pybamm.ParameterValues("Chen2020"); p["Current function [A]"]=5.0
p["Total heat transfer coefficient [W.m-2.K-1]"]=1e4  # clamp temperature ~ ambient (quasi-isothermal) so heat terms compare at 25 C
s=pybamm.Simulation(m,parameter_values=p).solve([0,3300],t_interp=np.arange(0,3301,30),initial_soc=1.0)
Q=s["Total heating [W]"].entries; T=s["X-averaged cell temperature [K]"].entries
print(json.dumps({"Q":Q.tolist(),"T":T.tolist()})[:200])
json.dump({"Q":Q.tolist()},open('/tmp/heat.json','w'))
print('mean Q',Q.mean(),'max T',T.max())
