# DRISHTI-HIMALAYA - RISK ENGINE MATHEMATICAL SPECIFICATION

---

## 1. Scientific Philosophy & Decision-Support Framing

The Drishti-Himalaya Risk Engine does **not** claim to provide deterministic predictions of the exact minute or cubic meter of a slope collapse. Rather, it computes an **explainable, relative, segment-level geotechnical exposure index** ($R_{\text{seg}} \in [0, 100]$) across discrete **250-meter** road elements.

This index measures the immediate spatial hazard exposure along transportation corridors, bridging macro-scale earth observation science with vehicular transit safety.

---

## 2. Core Segment Hazard Formulation

The composite segment hazard index ($R_{\text{seg}}$) is evaluated as a weighted Multi-Criteria Decision Analysis (MCDA) model:

$$R_{\text{seg}} = w_1 S_{\text{slope}} + w_2 S_{\text{rain}} + w_3 S_{\text{prox}} + w_4 S_{\text{density}} + w_5 S_{\text{exp}}$$

Subject to the constraint:
$$\sum_{j=1}^5 w_j = 1.0 \quad \text{where} \quad w_1=0.35,\ w_2=0.30,\ w_3=0.20,\ w_4=0.10,\ w_5=0.05$$

---

## 3. Modular Sub-Score Formulations

### 3.1 `slope_score(theta: float) -> float` ($S_{\text{slope}}$, Weight: 35%)
Topographic slope is the primary static determinant of gravitational shear stress along mountain cuts.

$$\theta = \text{Topographic slope angle in degrees from horizontal (0° - 90°)}$$

#### Mathematical Definition:
$$S_{\text{slope}} = \begin{cases} 
0 & \theta < 15^\circ \\
\dfrac{100}{1 + e^{-0.18(\theta - 35^\circ)}} & 15^\circ \le \theta \le 60^\circ \\
90 & \theta > 60^\circ \text{ (dominated by bare rockfall; reduced regolith mantle)}
\end{cases}$$

#### Geotechnical Behavior & Justification:
- Below $15^\circ$, mass movements along road cuts are negligible ($S_{\text{slope}} = 0$).
- Between $15^\circ$ and $60^\circ$, slope failure probability rises sharply, passing the natural angle of repose ($\approx 35^\circ$, where $S_{\text{slope}} = 50.0$) and peaking on steep cut-slopes ($45^\circ - 50^\circ$, where $S_{\text{slope}} \approx 85 - 94$).
- Above $60^\circ$, slope faces typically cannot retain unconsolidated regolith or thick colluvium; failures are dominated by dry planar joint falls rather than deep rotational soil slips, capped at $90.0$.

---

### 3.2 `rainfall_score(p24: float, p72: float, ari: float) -> float` ($S_{\text{rain}}$, Weight: 30%)
Hydro-meteorological saturation is the primary dynamic trigger of slope instability, elevating pore-water pressure ($u$) and reducing effective normal stress ($\sigma' = \sigma - u$).

#### Input Variables:
- $P_{24}$: 24-hour cumulative precipitation (mm)
- $P_{72}$: 72-hour cumulative precipitation (mm)
- $\text{ARI}$: 15-day Antecedent Rainfall Index with drainage coefficient $\lambda = 0.82$:
  $$\text{ARI}_t = \sum_{i=1}^{15} (0.82)^i P_{t-i}$$

#### Threshold Parameters (anchored in LANDSLIP and Garhwal studies):
- $T_{24} = 75.0\text{ mm}$ (24h shallow slide initiation threshold)
- $T_{72} = 140.0\text{ mm}$ (72h deep bedrock saturation threshold)
- $T_{\text{ARI}} = 200.0\text{ mm}$ (15-day regolith field capacity threshold)

#### Mathematical Definition:
$$S_{\text{rain}} = \min\left(100.0,\ \left(0.50 \frac{P_{24}}{T_{24}} + 0.30 \frac{P_{72}}{T_{72}} + 0.20 \frac{\text{ARI}}{T_{\text{ARI}}}\right) \times 100.0\right)$$

---

### 3.3 `proximity_score(d_min: float) -> float` ($S_{\text{prox}}$, Weight: 20%)
Proximity to historical landslide scars captures localized geomechanical weakness, crushed rock mass rating (RMR), and slickensided shear planes prone to reactivation.

#### Input Variables:
- $d_{\min}$: Minimum Euclidean distance from road segment to nearest mapped landslide point (meters).
- $d_0 = 350.0\text{ meters}$: Empirical spatial decay constant matching debris runout lengths in Garhwal terrain.

#### Mathematical Definition:
$$S_{\text{prox}} = 100.0 \cdot \exp\left(-\frac{d_{\min}}{d_0}\right)$$

#### Boundary Values:
- $d_{\min} = 0\text{ m} \implies S_{\text{prox}} = 100.0$
- $d_{\min} = 350\text{ m} \implies S_{\text{prox}} = 36.8$
- $d_{\min} = 1000\text{ m} \implies S_{\text{prox}} = 5.7$
- $d_{\min} \ge 1600\text{ m} \implies S_{\text{prox}} < 1.0$

---

### 3.4 `density_score(n_scars_1km: float) -> float` ($S_{\text{density}}$, Weight: 10%)
Spatial clustering of slope failures identifies macro-scale tectonic damage zones (e.g. proximity to Main Central Thrust fault zones).

#### Input Variables:
- $N_{\text{scars}}$: Number of mapped historical failure scars within a 1.0 km radius circle ($\text{Area} = \pi \approx 3.14\text{ km}^2$).
- $N_{\text{crit}} = 8.0\text{ scars/km}^2$: Critical historical density threshold recorded in Rudraprayag district.

#### Mathematical Definition:
$$S_{\text{density}} = \min\left(100.0,\ \frac{N_{\text{scars}}}{N_{\text{crit}}} \times 100.0\right)$$

---

### 3.5 `exposure_score(theta: float, is_cut_slope: bool) -> float` ($S_{\text{exp}}$, Weight: 5%)
Reflects anthropogenic toe excavation and mechanical blasting along road widening corridors. Over 81% of active slope failures along Char Dham highways occur in excavated toe zones within 100 meters of the road.

#### Mathematical Definition:
$$S_{\text{exp}} = \begin{cases} 100.0 & \theta > 30^\circ \text{ and within cut-slope buffer} \\ 20.0 & \text{otherwise} \end{cases}$$

---

## 4. Segment Risk Evaluation: `calculate_segment_risk()`

```python
def calculate_segment_risk(
    slope_deg: float,
    p24_mm: float,
    p72_mm: float,
    ari_mm: float,
    dist_scar_m: float,
    scar_density_1km: float,
    is_cut_slope: bool = True
) -> dict:
    s_slope = slope_score(slope_deg)
    s_rain = rainfall_score(p24_mm, p72_mm, ari_mm)
    s_prox = proximity_score(dist_scar_m)
    s_density = density_score(scar_density_1km)
    s_exp = exposure_score(slope_deg, is_cut_slope)
    
    r_seg = (
        0.35 * s_slope +
        0.30 * s_rain +
        0.20 * s_prox +
        0.10 * s_density +
        0.05 * s_exp
    )
    
    # Clamp to [0, 100]
    r_seg = max(0.0, min(100.0, r_seg))
    
    if r_seg < 25.0:
        tier = "LOW"
        color = "#10B981"
    elif r_seg < 50.0:
        tier = "MODERATE"
        color = "#EAB308"
    elif r_seg < 75.0:
        tier = "HIGH"
        color = "#F97316"
    else:
        tier = "SEVERE"
        color = "#EF4444"
        
    return {
        "risk_score": round(r_seg, 2),
        "risk_category": tier,
        "color_hex": color,
        "sub_scores": {
            "slope": round(s_slope, 2),
            "rain": round(s_rain, 2),
            "prox": round(s_prox, 2),
            "density": round(s_density, 2),
            "exp": round(s_exp, 2)
        }
    }
```

---

## 5. Route Hazard Aggregation: `calculate_route_risk()`

### The Arithmetic Masking Trap
Simple arithmetic averaging ($\frac{1}{n} \sum R_i$) is dangerous in natural hazard routing. A 100-km highway with an impassable 500-meter failure zone ($R_{\text{seg}} = 98$) surrounded by 99.5 km of flat valley road ($R_{\text{seg}} = 10$) would yield an average of $10.4$ ("LOW RISK"), misinforming motorists and risking lives.

### Bottleneck-Penalized Composite Hazard Function
To ensure any critical failure choke point elevates the route risk score:

$$R_{\text{route}} = 0.40 \cdot R_{\text{avg}} + 0.60 \cdot \max_{i=1\dots n}(R_i)$$

Where:
- $R_{\text{avg}} = \frac{\sum_{i=1}^n R_i \cdot l_i}{\sum_{i=1}^n l_i}$ (Length-weighted segment average)
- $\max(R_i)$ is the single worst bottleneck risk along the route.

---

## 6. Multi-Objective Route Optimization: `calculate_route_objective()`

When routing alternatives exist (e.g. Route A via Direct NH-7 vs Route B via Crest Alignment), the system optimizes a Pareto dual-objective cost function:

$$\min_P J(P) = \alpha \left(\frac{T(P)}{T_{\text{norm}}}\right) + \beta \left(\frac{R_{\text{route}}(P)}{R_{\text{norm}}}\right)$$

Subject to:
$$\alpha + \beta = 1.0, \quad \alpha \ge 0, \quad \beta \ge 0$$

- $T_{\text{norm}} = 360\text{ minutes}$ (Normalizing transit duration baseline)
- $R_{\text{norm}} = 100.0$ (Normalizing maximum hazard scale)
- **Clear Weather Profile:** $\alpha = 0.70, \beta = 0.30$ (Favors transit speed)
- **Monsoon / Heavy Rain Profile ($P_{24} > 50\text{ mm}$):** $\alpha = 0.20, \beta = 0.80$ (Prioritizes corridor stability and recommends safer detours even if 45–60 minutes longer).

---

## 7. Documented Scientific Assumptions & Limitations

1. **Surface Precipitation Proxy:** Pore-water pressure is estimated from surface rainfall ($P_{24}, P_{72}, \text{ARI}$) rather than direct in-situ piezometers or borehole inclinometers.
2. **Catalog Reporting Bias:** Mapped inventories from the NRSC Landslide Atlas capture large mass movements, but small debris ravelling events during heavy cloud cover may be omitted.
3. **Static DEM vs Dynamic Road Widening:** Static 30m Copernicus DEM does not reflect slope cuts blasted within recent weeks. The anthropogenic road exposure factor ($S_{\text{exp}}$) serves as a conservative mathematical compensator.
