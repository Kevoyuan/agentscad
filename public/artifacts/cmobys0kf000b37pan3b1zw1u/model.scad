// Spur Gear - Generated on 2024-06-08

// Parameters
teeth = 17;
outer_diameter = 20;
bore_diameter = 5;
thickness = 8;
pressure_angle = 20;

// Calculations
gear_module = outer_diameter / (teeth + 2);
addendum = gear_module;
root_diameter = gear_module * (teeth - 2.5);
tooth_width = gear_module;

// Gear model
difference() {
    union() {
        // Base cylinder
        cylinder(d = root_diameter, h = thickness, center = false);
        
        // Teeth
        for (i = [0:teeth-1]) {
            rotate([0, 0, i * 360 / teeth])
                translate([root_diameter/2, -tooth_width/2, 0])
                    cube([addendum, tooth_width, thickness]);
        }
    }
    // Bore hole
    cylinder(d = bore_diameter, h = thickness, center = false);
}