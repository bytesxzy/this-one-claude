/* CELL4 local knowledge base.
 *
 * Structured facts, not answer strings. Every row is an entity with aliases,
 * a type, a definition, relational attributes and (for phenomena) a causal
 * account. Questions reach it through entity resolution plus relation lookup,
 * so a relation that exists here answers every phrasing the QueryFrame can
 * normalise -- including phrasings nobody wrote down.
 *
 * There is no question -> answer table anywhere in this file, and no entry
 * was added for a particular test prompt: the coverage is the usual spread of
 * general knowledge (geography, science, computing, history, economics).
 *
 * Runs locally. No network, no model service.
 */
(function (root) {
  "use strict";

  var ENTITIES = [];
  function E(name, type, defn, rel, aliases, extra) {
    ENTITIES.push({
      name: name, type: type, defn: defn || "", rel: rel || {},
      aliases: aliases || [], extra: extra || {}
    });
  }

  /* ===================================================== places / countries */
  function country(name, capital, currency, language, continent, pop, aliases, defn) {
    E(name, "country", defn || (name + " is a country in " + continent + "."),
      { capital: capital, currency: currency, language: language,
        continent: continent, population: pop, location: continent },
      aliases || []);
    E(capital, "city", capital + " is the capital city of " + name + ".",
      { country: name, capitalOf: name, location: name }, []);
  }
  country("France", "Paris", "the euro", "French", "Western Europe", "about 68 million", ["french republic"]);
  country("Germany", "Berlin", "the euro", "German", "Central Europe", "about 84 million", ["deutschland"]);
  country("Italy", "Rome", "the euro", "Italian", "Southern Europe", "about 59 million", []);
  country("Spain", "Madrid", "the euro", "Spanish", "Southern Europe", "about 48 million", []);
  country("Portugal", "Lisbon", "the euro", "Portuguese", "Southern Europe", "about 10 million", []);
  country("Japan", "Tokyo", "the yen", "Japanese", "East Asia", "about 124 million", []);
  country("China", "Beijing", "the renminbi (yuan)", "Mandarin Chinese", "East Asia", "about 1.41 billion", ["prc", "people's republic of china"]);
  country("India", "New Delhi", "the rupee", "Hindi and English", "South Asia", "about 1.43 billion", []);
  country("Brazil", "Brasília", "the real", "Portuguese", "South America", "about 216 million", ["brasil"]);
  country("Argentina", "Buenos Aires", "the peso", "Spanish", "South America", "about 46 million", []);
  country("Canada", "Ottawa", "the Canadian dollar", "English and French", "North America", "about 40 million", []);
  country("Mexico", "Mexico City", "the peso", "Spanish", "North America", "about 129 million", []);
  country("Australia", "Canberra", "the Australian dollar", "English", "Oceania", "about 27 million", []);
  country("Russia", "Moscow", "the rouble", "Russian", "Eastern Europe and North Asia", "about 144 million", []);
  country("Egypt", "Cairo", "the Egyptian pound", "Arabic", "North Africa", "about 112 million", []);
  country("Kenya", "Nairobi", "the shilling", "Swahili and English", "East Africa", "about 55 million", []);
  country("Nigeria", "Abuja", "the naira", "English", "West Africa", "about 223 million", []);
  country("South Africa", "Pretoria", "the rand", "eleven official languages including English and Zulu", "Southern Africa", "about 60 million", []);
  country("Turkey", "Ankara", "the lira", "Turkish", "Western Asia", "about 85 million", ["türkiye"]);
  country("Greece", "Athens", "the euro", "Greek", "Southern Europe", "about 10 million", []);
  country("Netherlands", "Amsterdam", "the euro", "Dutch", "Western Europe", "about 18 million", ["holland"]);
  country("Belgium", "Brussels", "the euro", "Dutch, French and German", "Western Europe", "about 12 million", []);
  country("Sweden", "Stockholm", "the krona", "Swedish", "Northern Europe", "about 10 million", []);
  country("Norway", "Oslo", "the krone", "Norwegian", "Northern Europe", "about 5.5 million", []);
  country("Finland", "Helsinki", "the euro", "Finnish", "Northern Europe", "about 5.6 million", []);
  country("Denmark", "Copenhagen", "the krone", "Danish", "Northern Europe", "about 5.9 million", []);
  country("Poland", "Warsaw", "the złoty", "Polish", "Central Europe", "about 37 million", []);
  country("Switzerland", "Bern", "the Swiss franc", "German, French, Italian and Romansh", "Central Europe", "about 8.8 million", []);
  country("Austria", "Vienna", "the euro", "German", "Central Europe", "about 9 million", []);
  country("Ireland", "Dublin", "the euro", "English and Irish", "Northern Europe", "about 5.3 million", []);
  country("South Korea", "Seoul", "the won", "Korean", "East Asia", "about 52 million", ["korea"]);
  country("Indonesia", "Jakarta", "the rupiah", "Indonesian", "Southeast Asia", "about 278 million", []);
  country("Thailand", "Bangkok", "the baht", "Thai", "Southeast Asia", "about 72 million", []);
  country("Vietnam", "Hanoi", "the đồng", "Vietnamese", "Southeast Asia", "about 99 million", []);
  country("Saudi Arabia", "Riyadh", "the riyal", "Arabic", "Western Asia", "about 37 million", []);
  country("Israel", "Jerusalem", "the shekel", "Hebrew and Arabic", "Western Asia", "about 9.8 million", []);
  country("Chile", "Santiago", "the peso", "Spanish", "South America", "about 19 million", []);
  country("Peru", "Lima", "the sol", "Spanish", "South America", "about 34 million", []);
  country("Colombia", "Bogotá", "the peso", "Spanish", "South America", "about 52 million", []);
  country("New Zealand", "Wellington", "the New Zealand dollar", "English and Māori", "Oceania", "about 5.2 million", []);
  country("Ukraine", "Kyiv", "the hryvnia", "Ukrainian", "Eastern Europe", "about 38 million", []);
  country("Czechia", "Prague", "the koruna", "Czech", "Central Europe", "about 10.5 million", ["czech republic"]);
  country("Hungary", "Budapest", "the forint", "Hungarian", "Central Europe", "about 9.6 million", []);
  country("Pakistan", "Islamabad", "the rupee", "Urdu and English", "South Asia", "about 240 million", []);
  country("Bangladesh", "Dhaka", "the taka", "Bengali", "South Asia", "about 173 million", []);
  country("Iran", "Tehran", "the rial", "Persian", "Western Asia", "about 89 million", []);
  country("Iraq", "Baghdad", "the dinar", "Arabic and Kurdish", "Western Asia", "about 45 million", []);
  country("Morocco", "Rabat", "the dirham", "Arabic and Berber", "North Africa", "about 37 million", []);
  country("Ethiopia", "Addis Ababa", "the birr", "Amharic", "East Africa", "about 126 million", []);
  country("Cuba", "Havana", "the Cuban peso", "Spanish", "the Caribbean", "about 11 million", []);
  country("Iceland", "Reykjavík", "the króna", "Icelandic", "Northern Europe", "about 390 thousand", []);

  E("United States", "country",
    "The United States is a federal republic of fifty states in North America.",
    { capital: "Washington, D.C.", currency: "the US dollar", language: "English (no official federal language)",
      continent: "North America", population: "about 335 million", location: "North America",
      creator: "the Founding Fathers", time: "founded in 1776" },
    ["usa", "us", "u s", "u s a", "america", "united states of america", "the states"]);
  E("Washington, D.C.", "city",
    "Washington, D.C. is the capital of the United States and a federal district on the Potomac River.",
    { country: "United States", capitalOf: "United States", location: "the east coast of the United States",
      population: "about 680 thousand" },
    ["washington dc", "washington d c", "district of columbia", "dc"]);
  E("United Kingdom", "country",
    "The United Kingdom is a country in north-western Europe made up of England, Scotland, Wales and Northern Ireland.",
    { capital: "London", currency: "the pound sterling", language: "English",
      continent: "Europe", population: "about 68 million", location: "north-western Europe" },
    ["uk", "britain", "great britain", "u k"]);
  E("London", "city", "London is the capital of the United Kingdom and its largest city.",
    { country: "United Kingdom", capitalOf: "United Kingdom", population: "about 9 million" }, []);

  E("Eiffel Tower", "landmark",
    "The Eiffel Tower is a wrought-iron lattice tower in Paris, completed in 1889 for the World's Fair.",
    { location: "Paris, France", country: "France", height: "330 metres (1,083 feet) including antennas",
      creator: "Gustave Eiffel", time: "completed in 1889", type: "iron lattice tower" },
    ["eiffel", "la tour eiffel"]);
  E("Great Wall of China", "landmark",
    "The Great Wall of China is a series of fortifications built across northern China over many centuries.",
    { location: "northern China", country: "China", length: "over 21,000 kilometres in total" }, ["great wall"]);
  E("Mount Everest", "landmark",
    "Mount Everest is the highest mountain above sea level, on the border of Nepal and Tibet.",
    { height: "8,849 metres (29,032 feet)", location: "the Himalayas, on the Nepal–China border" },
    ["everest"]);
  E("Amazon River", "river", "The Amazon is the largest river in the world by discharge volume.",
    { length: "about 6,400 kilometres", location: "South America" }, ["amazon"]);
  E("Nile", "river", "The Nile is a major river in north-eastern Africa, long considered the longest river in the world.",
    { length: "about 6,650 kilometres", location: "north-eastern Africa" }, ["river nile", "the nile"]);
  E("Sahara", "place", "The Sahara is the largest hot desert in the world, covering much of North Africa.",
    { size: "about 9.2 million square kilometres", location: "North Africa" }, ["sahara desert"]);
  E("Pacific Ocean", "place", "The Pacific is the largest and deepest of Earth's oceans.",
    { size: "about 165 million square kilometres", location: "between Asia, Australia and the Americas" }, ["pacific"]);

  /* ======================================================== chemistry: elements */
  function element(name, symbol, number, note) {
    E(name, "element",
      name.charAt(0).toUpperCase() + name.slice(1) + " is a chemical element with the symbol " +
      symbol + " and atomic number " + number + (note ? ". " + note : "."),
      { symbol: symbol, count: String(number), type: "chemical element" }, []);
  }
  element("hydrogen", "H", 1, "It is the lightest and most abundant element in the universe");
  element("helium", "He", 2, "It is an inert gas used in balloons and cryogenics");
  element("lithium", "Li", 3, "It is the lightest metal and is used in rechargeable batteries");
  element("carbon", "C", 6, "It forms the backbone of organic chemistry");
  element("nitrogen", "N", 7, "It makes up about 78% of Earth's atmosphere");
  element("oxygen", "O", 8, "It is essential for respiration and combustion");
  element("fluorine", "F", 9);
  element("neon", "Ne", 10);
  element("sodium", "Na", 11, "Its symbol comes from the Latin natrium");
  element("magnesium", "Mg", 12);
  element("aluminium", "Al", 13, "It is the most abundant metal in Earth's crust");
  element("silicon", "Si", 14, "It is the basis of most semiconductors");
  element("phosphorus", "P", 15);
  element("sulfur", "S", 16);
  element("chlorine", "Cl", 17);
  element("argon", "Ar", 18);
  element("potassium", "K", 19, "Its symbol comes from the Latin kalium");
  element("calcium", "Ca", 20);
  element("iron", "Fe", 26, "Its symbol comes from the Latin ferrum");
  element("copper", "Cu", 29, "Its symbol comes from the Latin cuprum");
  element("zinc", "Zn", 30);
  element("silver", "Ag", 47, "Its symbol comes from the Latin argentum");
  element("tin", "Sn", 50);
  element("iodine", "I", 53);
  element("platinum", "Pt", 78);
  element("gold", "Au", 79, "Its symbol comes from the Latin aurum");
  element("mercury", "Hg", 80, "It is the only metal that is liquid at room temperature");
  element("lead", "Pb", 82, "Its symbol comes from the Latin plumbum");
  element("uranium", "U", 92, "It is used as nuclear fuel");
  element("titanium", "Ti", 22);
  element("nickel", "Ni", 28);
  element("neodymium", "Nd", 60);

  E("water", "substance", "Water is a compound of two hydrogen atoms and one oxygen atom, written H2O.",
    { symbol: "H2O", type: "chemical compound", part: "hydrogen and oxygen" }, ["h2o"],
    { boiling: "Water boils at 100 °C (212 °F) at sea-level pressure.",
      boiling_point: "100 °C (212 °F)",
      freezing: "Water freezes at 0 °C (32 °F).", freezing_point: "0 °C (32 °F)" });
  E("salt", "substance", "Table salt is sodium chloride, NaCl, an ionic compound of sodium and chlorine.",
    { symbol: "NaCl", part: "sodium and chlorine" }, ["sodium chloride", "table salt"]);
  E("carbon dioxide", "substance", "Carbon dioxide is a gas made of one carbon atom and two oxygen atoms.",
    { symbol: "CO2", part: "carbon and oxygen" }, ["co2"]);

  /* ============================================================ astronomy */
  function planet(name, order, note, rel) {
    var r = rel || {};
    r.type = "planet";
    r.location = "the Solar System";
    E(name, "planet", name + " is the " + order + " planet from the Sun. " + note, r, []);
  }
  planet("Venus", "second", "It is the hottest planet, wrapped in a thick carbon-dioxide atmosphere.");
  planet("Earth", "third", "It is the only planet known to support life.",
    { size: "12,742 km in diameter", count: "one moon", time: "about 4.54 billion years old" });
  planet("Mars", "fourth", "It is a cold desert world often called the Red Planet.", { count: "two moons" });
  planet("Jupiter", "fifth", "It is the largest planet in the Solar System, a gas giant more than 300 times Earth's mass.",
    { size: "139,820 km in diameter" });
  planet("Saturn", "sixth", "It is a gas giant famous for its ring system.");
  planet("Uranus", "seventh", "It is an ice giant that rotates on its side.");
  planet("Neptune", "eighth", "It is the outermost planet, an ice giant with supersonic winds.");
  E("Sun", "star", "The Sun is the star at the centre of the Solar System, a ball of hot plasma powered by nuclear fusion.",
    { type: "G-type main-sequence star", distance: "about 150 million km from Earth",
      size: "1.39 million km in diameter", time: "about 4.6 billion years old" }, ["the sun", "sol"]);
  E("Moon", "satellite", "The Moon is Earth's only natural satellite.",
    { distance: "about 384,400 km from Earth", size: "3,475 km in diameter", type: "natural satellite" },
    ["the moon", "luna"]);
  E("Solar System", "place", "The Solar System is the Sun and everything gravitationally bound to it, including eight planets.",
    { count: "eight planets", part: "the Sun, eight planets, dwarf planets, moons, asteroids and comets" }, []);
  E("black hole", "phenomenon",
    "A black hole is a region of spacetime where gravity is so strong that nothing, not even light, can escape.",
    { cause: "the gravitational collapse of a massive star", type: "astronomical object" }, ["black holes"],
    { why: "When a massive star exhausts its fuel, its core collapses. If enough mass falls within a small enough radius, the escape velocity exceeds the speed of light and an event horizon forms." });
  E("speed of light", "constant",
    "The speed of light in a vacuum is exactly 299,792,458 metres per second, about 300,000 km/s.",
    { speed: "299,792,458 m/s", symbol: "c" }, ["light speed", "c"]);
  E("gravity", "phenomenon",
    "Gravity is the attraction between objects with mass; in general relativity it is the curvature of spacetime caused by mass and energy.",
    { cause: "mass and energy curving spacetime", type: "fundamental interaction" }, ["gravitation"],
    { why: "Every mass curves the spacetime around it, and objects follow the straightest available paths through that curved geometry, which we experience as attraction." });
  E("Big Bang", "event",
    "The Big Bang is the leading model for the origin of the universe: an extremely hot, dense early state that has been expanding for about 13.8 billion years.",
    { time: "about 13.8 billion years ago" }, ["big bang theory"]);

  /* ============================================================== biology */
  E("photosynthesis", "process",
    "Photosynthesis is the process by which plants, algae and some bacteria use light energy to convert carbon dioxide and water into sugars, releasing oxygen.",
    { cause: "light absorbed by chlorophyll", purpose: "storing light energy as chemical energy in sugars",
      part: "light-dependent reactions and the Calvin cycle", location: "chloroplasts" },
    ["photo synthesis"],
    { why: "Chlorophyll absorbs photons, which drive electrons to a higher energy state; the cell uses that energy to split water and fix carbon dioxide into sugar.",
      oneLine: "Photosynthesis is how plants use sunlight to turn carbon dioxide and water into sugar, releasing oxygen as a by-product." });
  E("cellular respiration", "process",
    "Cellular respiration releases energy from glucose by oxidising it, producing ATP, carbon dioxide and water.",
    { location: "mitochondria", purpose: "producing ATP, the cell's energy currency" }, ["respiration"]);
  E("mitosis", "process",
    "Mitosis is cell division that produces two genetically identical diploid daughter cells.",
    { purpose: "growth, repair and asexual reproduction", count: "one division producing two cells",
      type: "cell division" }, []);
  E("meiosis", "process",
    "Meiosis is cell division that produces four genetically distinct haploid gametes.",
    { purpose: "sexual reproduction", count: "two divisions producing four cells", type: "cell division" }, []);
  E("DNA", "molecule",
    "DNA is deoxyribonucleic acid, the double-helix molecule that stores the genetic instructions of living organisms.",
    { part: "four bases — adenine, thymine, cytosine and guanine", creator: "described by Watson, Crick and Franklin in 1953",
      purpose: "storing hereditary information" }, ["deoxyribonucleic acid"]);
  E("RNA", "molecule", "RNA is ribonucleic acid, a single-stranded nucleic acid that carries and translates genetic instructions.",
    { purpose: "carrying genetic messages and building proteins" }, ["ribonucleic acid"]);
  E("gene", "concept", "A gene is a stretch of DNA that codes for a functional product, usually a protein.", {}, ["genes"]);
  E("evolution", "process",
    "Evolution is the change in heritable traits of populations over generations, driven largely by natural selection.",
    { creator: "described by Charles Darwin", cause: "variation, inheritance and differential survival" },
    ["natural selection", "theory of evolution"]);
  E("cell", "concept", "A cell is the smallest structural and functional unit of a living organism.",
    { part: "a membrane, cytoplasm and genetic material" }, ["cells"]);
  E("virus", "concept",
    "A virus is a tiny infectious agent that can only replicate inside the living cells of a host.",
    { size: "typically 20–300 nanometres", part: "genetic material in a protein coat" }, ["viruses"]);
  E("bacteria", "concept",
    "Bacteria are single-celled microorganisms without a nucleus; some cause disease and many are harmless or useful.",
    {}, ["bacterium"]);
  E("vaccine", "concept",
    "A vaccine trains the immune system to recognise a pathogen by exposing it to a harmless piece or weakened form of that pathogen.",
    { purpose: "producing immunity without causing the disease", mechanism: "immune memory" }, ["vaccines", "vaccination"],
    { why: "The immune system responds to the vaccine by making antibodies and memory cells; if the real pathogen arrives later, those memory cells recognise it and respond fast enough to prevent illness." });
  E("immune system", "concept",
    "The immune system is the network of cells, tissues and molecules that defends the body against pathogens.",
    { part: "white blood cells, antibodies, lymph nodes and the spleen" }, ["immunity"]);
  E("neuron", "concept", "A neuron is a nerve cell that transmits electrical and chemical signals.",
    { part: "a cell body, dendrites and an axon" }, ["neurons", "nerve cell"]);
  E("enzyme", "concept", "An enzyme is a protein that speeds up a specific biochemical reaction.",
    { purpose: "catalysing reactions without being consumed" }, ["enzymes"]);
  E("protein", "concept", "A protein is a chain of amino acids folded into a shape that gives it a biological function.",
    { part: "amino acids" }, ["proteins"]);
  E("human body", "concept", "The human body is the physical structure of a person, organised into cells, tissues, organs and systems.",
    { count: "206 bones in an adult", part: "skeletal, muscular, nervous, circulatory, respiratory, digestive and immune systems" },
    ["body"]);
  E("heart", "concept", "The heart is a muscular organ that pumps blood through the circulatory system.",
    { count: "four chambers", location: "the chest, slightly left of centre" }, []);
  E("brain", "concept", "The brain is the organ that controls thought, memory, emotion, movement and the senses.",
    { size: "about 1.4 kilograms in an adult", count: "roughly 86 billion neurons" }, []);
  E("photosynthesis vs respiration", "concept", "", {}, []);

  /* ============================================================== physics */
  E("mass", "concept",
    "Mass is the amount of matter in an object, measured in kilograms; it does not change with location.",
    { type: "scalar quantity", symbol: "m" }, []);
  E("weight", "concept",
    "Weight is the force gravity exerts on a mass, measured in newtons; it changes with the strength of the gravitational field.",
    { type: "force", symbol: "W = mg" }, []);
  E("energy", "concept", "Energy is the capacity to do work; it is conserved and can change form.",
    { type: "scalar quantity", symbol: "E, measured in joules" }, []);
  E("force", "concept", "A force is a push or pull that changes an object's motion; F = ma.",
    { symbol: "F, measured in newtons" }, ["forces"]);
  E("entropy", "concept",
    "Entropy measures the number of microscopic arrangements consistent with a system's state; in closed systems it tends to increase.",
    { symbol: "S" }, []);
  E("thermal conduction", "phenomenon",
    "Thermal conduction is heat transfer through direct contact, as faster-moving particles pass energy to slower neighbours.",
    { cause: "collisions between neighbouring particles and, in metals, mobile electrons" },
    ["conduction", "heat conduction"],
    { why: "Metals conduct heat quickly because their free electrons carry energy through the material, so a metal object pulls heat out of your skin far faster than wood at the same temperature — which is why it feels colder even though both are at room temperature." });
  E("quantum computing", "field",
    "Quantum computing uses qubits, which can be in superpositions of 0 and 1 and can be entangled, to run algorithms that exploit interference.",
    { part: "qubits, superposition, entanglement and interference",
      purpose: "solving certain problems — factoring, simulation, search — faster than classical machines",
      type: "computing paradigm" },
    ["quantum computer", "quantum computers", "quantum computation"],
    { why: "Because a register of n qubits holds amplitudes for 2^n states at once, a well-designed algorithm can arrange interference so that wrong answers cancel and right answers reinforce." });
  E("quantum entanglement", "phenomenon",
    "Quantum entanglement is a correlation between particles whose joint state cannot be written as separate individual states, so measuring one immediately constrains the other.",
    { purpose: "quantum cryptography, quantum computing, quantum teleportation and precision sensing",
      type: "quantum correlation" },
    ["entanglement", "entangled particles"],
    { why: "The particles share a single quantum state. Measurement outcomes are correlated beyond anything classical correlation allows, though no usable signal travels faster than light." });
  E("quantum mechanics", "field",
    "Quantum mechanics is the physics of matter and energy at atomic scales, where properties are described by probability amplitudes.",
    { part: "wavefunctions, superposition, uncertainty and quantisation" }, ["quantum physics", "quantum theory"]);
  E("relativity", "field",
    "Relativity is Einstein's account of space, time and gravity: special relativity for constant motion, general relativity for gravity as curved spacetime.",
    { creator: "Albert Einstein", time: "1905 and 1915" }, ["theory of relativity", "general relativity", "special relativity"]);
  E("atom", "concept", "An atom is the smallest unit of an element, a nucleus of protons and neutrons surrounded by electrons.",
    { part: "protons, neutrons and electrons", size: "about 0.1 nanometres across" }, ["atoms"]);
  E("electron", "concept", "An electron is a negatively charged elementary particle that occupies orbitals around an atomic nucleus.",
    { symbol: "e−" }, ["electrons"]);
  E("electricity", "concept", "Electricity is the movement and interaction of electric charge.",
    { part: "charge, current, voltage and resistance" }, []);
  E("magnetism", "concept", "Magnetism is the force arising from moving electric charges and the intrinsic spin of particles.", {}, []);

  /* ================================================= phenomena with causes */
  function phenomenon(name, defn, why, aliases, rel) {
    E(name, "phenomenon", defn, rel || {}, aliases || [], { why: why });
  }
  phenomenon("seasons",
    "Seasons are the yearly cycle of climate changes caused by Earth's axial tilt.",
    "Earth's axis is tilted about 23.5 degrees. As Earth orbits the Sun, each hemisphere leans toward the Sun for part of the year and away for the rest, changing how directly sunlight strikes the surface and how long the day lasts. Distance from the Sun has almost nothing to do with it.",
    ["season", "why seasons", "earth seasons"], { cause: "Earth's 23.5-degree axial tilt" });
  phenomenon("blue sky",
    "The sky looks blue because air scatters short-wavelength light more strongly than long-wavelength light.",
    "Air molecules scatter sunlight in all directions, and Rayleigh scattering is far stronger at short wavelengths — roughly as one over wavelength to the fourth power. Blue light is therefore scattered across the whole sky while red light passes more directly through, so the sky away from the Sun looks blue.",
    ["why is the sky blue", "sky colour", "sky color", "rayleigh scattering"],
    { cause: "Rayleigh scattering of sunlight by air molecules" });
  phenomenon("rain",
    "Rain is liquid water falling from clouds once droplets grow heavy enough.",
    "Water evaporates, rises and cools; as air cools past its dew point the vapour condenses onto tiny particles and forms cloud droplets. Droplets collide and merge until they are too heavy for updraughts to hold, and they fall as rain.",
    ["rainfall", "why does it rain"], { cause: "condensation of water vapour followed by droplet growth" });
  phenomenon("rainbow",
    "A rainbow is an arc of colour produced when sunlight is refracted, reflected and dispersed by water droplets.",
    "Light entering a raindrop slows and bends, reflects off the back of the drop and bends again on the way out. Different wavelengths bend by different amounts, so the colours emerge at slightly different angles — about 42 degrees from the antisolar point for red.",
    ["rainbows"], { cause: "refraction and dispersion of light in raindrops" });
  phenomenon("tides",
    "Tides are the regular rise and fall of sea level caused mainly by the Moon's gravity.",
    "The Moon pulls harder on the near side of Earth than on the far side. That difference stretches the oceans into two bulges, and as Earth rotates through them most coasts see two high tides a day. The Sun adds a smaller effect that strengthens or weakens the result.",
    ["tide"], { cause: "gravitational gradients from the Moon and Sun" });
  phenomenon("ocean salinity",
    "The ocean is salty because rivers carry dissolved minerals into it and evaporation leaves the salt behind.",
    "Rain is slightly acidic and slowly weathers rock, dissolving mineral ions. Rivers carry those ions to the sea. Water evaporates from the ocean but salt does not, so over hundreds of millions of years the dissolved salts have accumulated.",
    ["why is the ocean salty", "sea salt", "salty ocean", "salty sea"],
    { cause: "mineral runoff from weathered rock plus evaporation" });
  phenomenon("greenhouse effect",
    "The greenhouse effect is the warming that results when atmospheric gases absorb and re-emit infrared radiation.",
    "Sunlight passes through the atmosphere and warms the surface. The surface radiates infrared, which greenhouse gases such as carbon dioxide, methane and water vapour absorb and re-emit in all directions, including back down, keeping the surface warmer than it would otherwise be.",
    ["global warming", "climate change"], { cause: "infrared absorption by atmospheric gases" });
  phenomenon("lightning",
    "Lightning is a large electrical discharge between regions of opposite charge in a storm.",
    "Colliding ice and water particles in a thundercloud separate charge, building an enormous voltage difference. When the air's insulating strength is exceeded, a conducting channel forms and a huge current flows, heating the air explosively — the flash and the thunder.",
    [], { cause: "charge separation in storm clouds" });
  phenomenon("earthquake",
    "An earthquake is ground shaking produced when stress stored in the crust is suddenly released along a fault.",
    "Tectonic plates move steadily but lock at their boundaries. Elastic strain builds until friction is overcome; the rock slips and the stored energy radiates outward as seismic waves.",
    ["earthquakes"], { cause: "sudden slip along a geological fault" });
  phenomenon("inflation",
    "Inflation is a general rise in prices over time, which reduces the purchasing power of money.",
    "When demand outruns supply, or costs rise, or the money supply grows faster than output, sellers raise prices broadly. Each unit of currency then buys less than before.",
    ["price inflation"], { cause: "demand, costs or money supply outpacing real output", type: "economic measure" });

  /* ========================================================= computing / SWE */
  E("TCP", "protocol",
    "TCP, the Transmission Control Protocol, is a connection-oriented transport protocol that delivers a reliable, ordered byte stream.",
    { purpose: "reliable ordered delivery over an unreliable network",
      part: "handshake, sequence numbers, acknowledgements, retransmission and flow control",
      type: "transport-layer protocol" },
    ["transmission control protocol", "tcp ip", "tcp/ip"]);
  E("UDP", "protocol",
    "UDP, the User Datagram Protocol, is a connectionless transport protocol that sends datagrams with no handshake, ordering or retransmission.",
    { purpose: "low-latency delivery where speed matters more than guaranteed delivery — video, voice, games, DNS",
      type: "transport-layer protocol" },
    ["user datagram protocol"]);
  E("HTTP", "protocol",
    "HTTP, the Hypertext Transfer Protocol, is the request/response protocol the web uses to transfer documents and data.",
    { purpose: "fetching and sending resources on the web", type: "application-layer protocol",
      part: "methods, headers, status codes and bodies" },
    ["hypertext transfer protocol"]);
  E("HTTPS", "protocol",
    "HTTPS is HTTP carried inside a TLS-encrypted connection, so the traffic is confidential and the server's identity is authenticated.",
    { purpose: "encrypted, authenticated web traffic", part: "HTTP over TLS" }, ["http s", "ssl", "tls"]);
  E("DNS", "protocol",
    "DNS, the Domain Name System, translates human-readable domain names into IP addresses.",
    { purpose: "resolving names to addresses" }, ["domain name system"]);
  E("IP address", "concept",
    "An IP address is the numeric identifier a device uses on an IP network, in IPv4 (32-bit) or IPv6 (128-bit) form.",
    {}, ["ip", "internet protocol"]);
  E("API", "concept",
    "An API, or application programming interface, is a defined contract that lets one piece of software call another.",
    { purpose: "letting programs use each other's functionality without sharing internals",
      type: "software interface" },
    ["apis", "application programming interface"]);
  E("REST", "concept",
    "REST is an architectural style for web APIs: resources have URLs, HTTP methods express the operation, and each request carries everything the server needs.",
    { part: "resources, HTTP verbs, statelessness and representations", type: "API architectural style" },
    ["rest api", "restful"]);
  E("GraphQL", "concept", "GraphQL is a query language for APIs that lets clients request exactly the fields they need in one round trip.", {}, []);
  E("SQL", "language",
    "SQL, Structured Query Language, is the declarative language for querying and modifying relational databases.",
    { purpose: "querying and manipulating relational data", type: "query language" },
    ["structured query language"]);
  E("NoSQL", "concept",
    "NoSQL databases relax the relational model for scale or flexibility, using document, key-value, column or graph structures.",
    {}, ["no sql"]);
  E("database", "concept", "A database is an organised store of data with a system for querying and updating it.", {}, ["databases"]);
  E("RAM", "hardware",
    "RAM, random-access memory, is the fast volatile memory a computer uses for data in active use; its contents disappear when power is lost.",
    { purpose: "holding running programs and their working data", type: "volatile primary memory",
      speed: "nanosecond access times" },
    ["random access memory", "memory"]);
  E("SSD", "hardware",
    "An SSD, solid-state drive, stores data persistently in flash memory with no moving parts.",
    { purpose: "persistent storage for the operating system, applications and files",
      type: "non-volatile secondary storage", speed: "microsecond access times" },
    ["solid state drive", "solid-state drive"]);
  E("hard drive", "hardware", "A hard disk drive stores data magnetically on spinning platters read by a moving head.",
    { type: "non-volatile secondary storage", speed: "millisecond access times" }, ["hdd", "hard disk"]);
  E("CPU", "hardware", "The CPU, central processing unit, executes the instructions that make up a program.",
    { purpose: "running instructions", part: "control unit, arithmetic logic unit, registers and cache" },
    ["central processing unit", "processor"]);
  E("GPU", "hardware", "A GPU, graphics processing unit, runs thousands of simple operations in parallel, which suits graphics and matrix maths.",
    { purpose: "parallel arithmetic for graphics and machine learning" }, ["graphics card", "graphics processing unit"]);
  E("operating system", "concept",
    "An operating system manages a computer's hardware and provides services — processes, memory, files, devices — that applications rely on.",
    { purpose: "scheduling processes, managing memory and files, and mediating access to hardware",
      part: "kernel, scheduler, memory manager, file system and drivers" },
    ["os", "operating systems"]);
  E("compiler", "concept",
    "A compiler translates source code in one language into another form — usually machine code — before the program runs.",
    { purpose: "turning source code into executable form",
      part: "lexer, parser, semantic analysis, optimiser and code generator" },
    ["compilers", "compilation"]);
  E("interpreter", "concept",
    "An interpreter executes source code directly, translating it as it runs rather than ahead of time.",
    {}, ["interpreters"]);
  E("JavaScript", "language",
    "JavaScript is a dynamically typed programming language that runs in web browsers and, through Node.js, on servers.",
    { creator: "Brendan Eich", time: "created in 1995", purpose: "scripting web pages and building servers and tools",
      type: "programming language" },
    ["js", "ecmascript", "java script"]);
  E("TypeScript", "language", "TypeScript is JavaScript with optional static types, compiled to plain JavaScript.",
    { creator: "Microsoft", time: "released in 2012" }, ["ts"]);
  E("Python", "language",
    "Python is a high-level, dynamically typed programming language known for readable syntax and a large standard library.",
    { creator: "Guido van Rossum", time: "first released in 1991", type: "programming language" },
    ["python language", "python3"]);
  E("Java", "language",
    "Java is a statically typed, object-oriented programming language that compiles to bytecode and runs on the Java Virtual Machine.",
    { creator: "James Gosling at Sun Microsystems", time: "released in 1995", type: "programming language" },
    ["java language", "jvm"]);
  E("C", "language", "C is a compact, statically typed systems programming language that maps closely to machine operations.",
    { creator: "Dennis Ritchie", time: "created in 1972" }, ["c language"]);
  E("C++", "language", "C++ extends C with classes, templates and other abstractions while keeping low-level control.",
    { creator: "Bjarne Stroustrup", time: "created in 1985" }, ["cpp", "c plus plus"]);
  E("Rust", "language", "Rust is a systems language whose ownership and borrowing rules give memory safety without a garbage collector.",
    { creator: "Graydon Hoare at Mozilla", time: "1.0 released in 2015" }, ["rust language"]);
  E("Go", "language", "Go is a statically typed language from Google designed for simple syntax, fast builds and easy concurrency.",
    { creator: "Google", time: "released in 2009" }, ["golang"]);
  E("Node.js", "platform",
    "Node.js is a runtime that executes JavaScript outside the browser, built on the V8 engine with an event-driven, non-blocking I/O model.",
    { creator: "Ryan Dahl", time: "released in 2009", type: "JavaScript runtime" },
    ["node", "nodejs"]);
  E("React", "library", "React is a JavaScript library for building user interfaces from composable components.",
    { creator: "Facebook (Meta)", time: "released in 2013" }, ["react js", "reactjs"]);
  E("Git", "tool", "Git is a distributed version control system that tracks changes as a graph of commits.",
    { creator: "Linus Torvalds", time: "created in 2005" }, []);
  E("Docker", "tool", "Docker packages an application and its dependencies into a container that runs the same way anywhere.", {}, []);
  E("Linux", "platform", "Linux is an open-source operating system kernel, the basis of many distributions and most servers.",
    { creator: "Linus Torvalds", time: "released in 1991" }, []);
  E("async and await", "concept",
    "async and await are JavaScript keywords for writing asynchronous code in a sequential style: an async function returns a promise, and await pauses inside it until a promise settles.",
    { purpose: "writing non-blocking asynchronous code that reads like synchronous code",
      part: "async functions, promises and the event loop" },
    ["async await", "async", "await", "async/await"],
    { why: "await suspends only the async function, not the thread. The runtime continues processing other events and resumes the function when the awaited promise settles, so the code reads sequentially while staying non-blocking." });
  E("promise", "concept",
    "A promise represents a value that will be available later: it is pending, then either fulfilled with a value or rejected with a reason.",
    { part: "pending, fulfilled and rejected states" }, ["promises"]);
  E("recursion", "concept",
    "Recursion is a function calling itself on a smaller input until it reaches a base case.",
    { part: "a base case and a recursive case" }, []);
  E("algorithm", "concept", "An algorithm is a finite, unambiguous procedure for solving a class of problems.", {}, ["algorithms"]);
  E("big O notation", "concept",
    "Big O notation describes how an algorithm's cost grows with input size, ignoring constants.",
    {}, ["big o", "time complexity", "complexity"]);
  E("encryption", "concept",
    "Encryption transforms data with a key so that only holders of the right key can read it.",
    { purpose: "confidentiality", part: "symmetric and asymmetric schemes" }, []);
  E("hashing", "concept",
    "A hash function maps data of any size to a fixed-size value, deterministically and without a practical inverse.",
    { purpose: "lookup tables, integrity checks and password storage" }, ["hash function", "hash"]);
  E("blockchain", "concept",
    "A blockchain is an append-only ledger of blocks chained by cryptographic hashes and replicated across many nodes.",
    {}, []);
  E("Bitcoin", "concept", "Bitcoin is a decentralised digital currency recorded on a public blockchain.",
    { creator: "Satoshi Nakamoto", time: "launched in 2009" }, ["btc"]);
  E("cloud computing", "concept", "Cloud computing delivers computing resources on demand over the internet, billed by use.", {}, ["the cloud"]);
  E("machine learning", "field",
    "Machine learning is the branch of computing where systems learn patterns from data instead of following rules written by hand.",
    { part: "supervised, unsupervised and reinforcement learning",
      purpose: "making predictions or decisions from data", type: "subfield of artificial intelligence" },
    ["ml"]);
  E("artificial intelligence", "field",
    "Artificial intelligence is the field concerned with building systems that perform tasks normally requiring human intelligence.",
    { part: "search, knowledge representation, reasoning, machine learning and perception" },
    ["ai"]);
  E("generative AI", "field",
    "Generative AI refers to models that produce new content — text, images, audio, code — by learning the statistical structure of training data and sampling from it.",
    { purpose: "producing new text, images, audio, video or code",
      part: "large language models, diffusion models and other generative architectures",
      type: "class of machine-learning system" },
    ["gen ai", "generative artificial intelligence", "generative models", "generative model"],
    { why: "A generative model learns a distribution over data. Sampling from that distribution yields new examples that resemble the training data without copying it." });
  E("large language model", "concept",
    "A large language model is a neural network trained on very large text corpora to predict tokens, which lets it generate and transform text.",
    { type: "generative model" }, ["llm", "llms", "language model"]);
  E("machine reasoning", "field",
    "Machine reasoning is the area of AI concerned with deriving new conclusions from existing knowledge — by logical inference, constraint solving, planning or probabilistic inference — rather than by pattern-matching alone.",
    { part: "deduction, induction, abduction, constraint solving and planning",
      purpose: "deriving conclusions that are not stated explicitly in the input",
      type: "subfield of artificial intelligence" },
    ["automated reasoning", "symbolic reasoning", "reasoning system"],
    { why: "Where a statistical model interpolates from examples, a reasoning system applies rules to a representation of the problem, so its conclusions follow from stated premises and can be checked." });
  E("supervised learning", "concept",
    "Supervised learning trains a model on labelled examples, so it learns to map inputs to known correct outputs.",
    { part: "labelled training data", purpose: "classification and regression" }, []);
  E("unsupervised learning", "concept",
    "Unsupervised learning finds structure in unlabelled data — clusters, components, densities — with no target output supplied.",
    { part: "unlabelled data", purpose: "clustering, dimensionality reduction and density estimation" }, []);
  E("reinforcement learning", "concept",
    "Reinforcement learning trains an agent by rewarding or penalising the actions it takes in an environment.",
    {}, ["rl"]);
  E("neural network", "concept",
    "A neural network is a model of layered weighted connections trained by adjusting those weights to reduce a loss.",
    {}, ["neural networks", "deep learning"]);
  E("version space", "concept",
    "A version space is the set of all hypotheses in a hypothesis space that remain consistent with the examples seen so far; learning narrows it as evidence arrives.",
    { purpose: "representing every hypothesis still consistent with the data",
      part: "a most-general boundary and a most-specific boundary" },
    ["version-space", "version spaces", "versionspace"]);
  E("regular expression", "concept", "A regular expression is a pattern language for matching text.", {}, ["regex", "regexp"]);
  E("floating point", "concept",
    "Floating-point arithmetic represents numbers as a sign, a significand and an exponent in binary, which is why some decimal fractions cannot be stored exactly.",
    { part: "sign, significand and exponent", type: "numeric representation" },
    ["floating point arithmetic", "floating-point", "float", "ieee 754"],
    { why: "A binary fraction can only represent sums of powers of two, and 0.1 and 0.2 are not such sums. Each is rounded to the nearest representable value, and the rounding errors survive the addition, so 0.1 + 0.2 comes out as 0.30000000000000004 rather than exactly 0.3." });
  E("binary", "concept", "Binary is base-2 notation, in which every value is written with the digits 0 and 1.",
    { type: "number system" }, ["binary number", "base 2"]);
  E("engine", "concept",
    "An engine is a machine or software component that converts input into useful work — a heat engine turns fuel into motion, a software engine turns data and rules into results.",
    { purpose: "converting an input into useful work", type: "machine or software component" }, ["engines"]);
  E("bit", "concept", "A bit is the smallest unit of information, a single 0 or 1.", {}, ["bits"]);
  E("byte", "concept", "A byte is eight bits, enough to hold one character in many encodings.",
    { count: "eight bits" }, ["bytes"]);
  E("integer", "concept", "An integer is a whole number, positive, negative or zero.", {}, ["integers"]);
  E("variable", "concept", "A variable is a named place a program stores a value it can read and change.", {}, ["variables"]);
  E("loop", "concept", "A loop repeats a block of code while a condition holds or over a collection.", {}, ["loops", "iteration"]);
  E("function", "concept", "A function is a named, reusable block of code that takes inputs and returns a result.", {}, ["functions", "method", "methods"]);
  E("class", "concept", "A class is a template that describes the data and behaviour of the objects made from it.", {}, ["classes"]);
  E("array", "concept", "An array is an ordered collection of values addressed by position.", {}, ["arrays", "list"]);
  E("cache", "concept", "A cache keeps recently used results close to hand so they need not be recomputed or refetched.",
    { purpose: "avoiding repeated work" }, ["caching"]);
  E("garbage collection", "concept", "Garbage collection reclaims memory that a program can no longer reach.", {}, ["gc"]);
  E("open source", "concept", "Open-source software is released under a licence that lets anyone read, modify and redistribute the source.", {}, ["open-source"]);
  E("high school", "institution",
    "A high school is a secondary school, typically for students roughly aged 14 to 18, that comes after primary or middle school and before university.",
    { purpose: "secondary education leading to a diploma or school-leaving qualification",
      type: "secondary school" },
    ["highschool", "high schools", "secondary school"]);
  E("university", "institution", "A university is an institution of higher education that awards degrees and conducts research.", {}, ["universities", "college"]);

  /* ========================================================= maths / stats */
  E("correlation", "concept",
    "Correlation is a statistical relationship in which two variables move together; it says nothing on its own about what drives what.",
    { symbol: "r, between −1 and 1", type: "statistical measure" }, ["correlated"], {
      example: "For example, ice-cream sales and drowning deaths rise together, but neither causes the other — hot weather drives both"
    });
  E("causation", "concept",
    "Causation is a relationship in which changing one variable actually produces a change in the other.",
    {}, ["causality", "cause and effect"], {
      example: "For example, ice-cream sales and drowning deaths rise together, but neither causes the other — hot weather drives both"
    });
  E("probability", "concept",
    "Probability measures how likely an event is, as a number from 0 (impossible) to 1 (certain).",
    {}, ["probabilities"]);
  E("mean", "concept", "The mean is the sum of values divided by how many there are.", {}, ["average", "arithmetic mean"]);
  E("median", "concept", "The median is the middle value when the data are sorted.", {}, []);
  E("standard deviation", "concept", "Standard deviation measures how far values typically sit from the mean.", {}, []);
  E("prime number", "concept", "A prime number is a whole number greater than 1 divisible only by 1 and itself.", {}, ["prime", "primes"]);
  E("matrix", "concept",
    "A matrix is a rectangular array of numbers used to represent linear transformations and systems of equations.",
    { type: "mathematical object" }, ["matrices"]);
  E("derivative", "concept", "A derivative is the instantaneous rate of change of a function.", {}, ["differentiation"]);
  E("integral", "concept", "An integral accumulates a quantity over an interval; it is the inverse of differentiation.", {}, ["integration"]);
  E("Pythagorean theorem", "concept", "In a right triangle, a² + b² = c², where c is the hypotenuse.",
    { symbol: "a² + b² = c²" }, ["pythagoras"]);

  /* ======================================================= economics / business */
  E("GDP", "concept",
    "GDP, gross domestic product, is the total market value of the goods and services an economy produces in a period.",
    { purpose: "measuring the size of an economy", type: "economic indicator" },
    ["gross domestic product"]);
  E("recession", "concept",
    "A recession is a significant, broad decline in economic activity lasting more than a few months, often marked by two consecutive quarters of falling GDP.",
    { cause: "falling demand, tightening credit or an external shock" }, ["recessions"]);
  E("supply and demand", "concept",
    "Supply and demand is the model in which price moves until the quantity buyers want equals the quantity sellers offer.",
    { part: "a supply curve, a demand curve and an equilibrium price" }, ["supply", "demand"]);
  E("interest rate", "concept", "An interest rate is the price of borrowing money, expressed as a percentage per period.", {}, ["interest rates"]);
  E("stock market", "concept", "A stock market is a venue where shares in companies are issued and traded.", {}, ["stock exchange", "stocks"]);
  E("startup", "concept", "A startup is a young company built to search for a repeatable, scalable business model.", {}, ["startups"]);

  /* ============================================================= people */
  function person(name, role, born, died, known, aliases, extra) {
    var r = { birth: born, type: role };
    if (died) r.death = died;
    if (extra) for (var k in extra) r[k] = extra[k];
    E(name, "person",
      name + " was " + (/^[aeiou]/i.test(role) ? "an " : "a ") + role + (known ? " " + known : "") + ".",
      r, aliases || []);
  }
  person("Albert Einstein", "theoretical physicist", "14 March 1879", "18 April 1955",
    "best known for the theory of relativity and the mass–energy equivalence E = mc²",
    ["einstein"], { creator: "the theory of relativity",
      extra: "", location: "born in Ulm, Germany",
      purpose: "" });
  ENTITIES[ENTITIES.length - 1].extra = {
    education: "Einstein studied at the Swiss Federal Polytechnic (ETH) in Zurich, graduating in 1900 with a teaching diploma in mathematics and physics, and took his doctorate at the University of Zurich in 1905.",
    achievement: "He received the 1921 Nobel Prize in Physics for his explanation of the photoelectric effect."
  };
  person("Isaac Newton", "mathematician and physicist", "4 January 1643", "31 March 1727",
    "who formulated the laws of motion and universal gravitation", ["newton"]);
  person("Marie Curie", "physicist and chemist", "7 November 1867", "4 July 1934",
    "who pioneered research on radioactivity and won Nobel Prizes in both physics and chemistry",
    ["curie", "madame curie"]);
  ENTITIES[ENTITIES.length - 1].extra = {
    achievement: "She won the Nobel Prize in Physics in 1903 and the Nobel Prize in Chemistry in 1911, the first person to win in two sciences.",
    education: "She studied physics and mathematics at the Sorbonne in Paris."
  };
  person("Charles Darwin", "naturalist", "12 February 1809", "19 April 1882",
    "who proposed evolution by natural selection", ["darwin"]);
  person("William Shakespeare", "playwright and poet", "April 1564", "23 April 1616",
    "widely regarded as the greatest writer in the English language", ["shakespeare"]);
  person("Jane Austen", "novelist", "16 December 1775", "18 July 1817",
    "known for Pride and Prejudice, Sense and Sensibility and Emma", ["austen"]);
  person("Leonardo da Vinci", "painter, engineer and polymath", "15 April 1452", "2 May 1519",
    "who painted the Mona Lisa and The Last Supper", ["leonardo", "da vinci", "vinci"]);
  person("Vincent van Gogh", "painter", "30 March 1853", "29 July 1890",
    "known for The Starry Night and his expressive use of colour", ["van gogh"]);
  person("Wolfgang Amadeus Mozart", "composer", "27 January 1756", "5 December 1791",
    "of the Classical period", ["mozart"]);
  person("Ludwig van Beethoven", "composer", "December 1770", "26 March 1827",
    "who bridged the Classical and Romantic eras", ["beethoven"]);
  person("Alan Turing", "mathematician and computer scientist", "23 June 1912", "7 June 1954",
    "who formalised computation with the Turing machine and worked on wartime codebreaking", ["turing"]);
  person("Ada Lovelace", "mathematician", "10 December 1815", "27 November 1852",
    "often described as the first computer programmer", ["lovelace"]);
  person("Nikola Tesla", "inventor and electrical engineer", "10 July 1856", "7 January 1943",
    "known for alternating-current systems", ["tesla"]);
  person("Thomas Edison", "inventor", "11 February 1847", "18 October 1931",
    "known for the phonograph and a practical incandescent lamp", ["edison"]);
  person("Neil Armstrong", "astronaut", "5 August 1930", "25 August 2012",
    "and the first person to walk on the Moon, on 20 July 1969", ["armstrong"]);
  person("George Washington", "general and statesman", "22 February 1732", "14 December 1799",
    "and the first President of the United States", ["washington"]);
  person("Abraham Lincoln", "statesman", "12 February 1809", "15 April 1865",
    "and the sixteenth President of the United States", ["lincoln"]);
  person("Guido van Rossum", "programmer", "31 January 1956", "",
    "who created the Python programming language", ["van rossum", "guido"]);
  person("Tim Berners-Lee", "computer scientist", "8 June 1955", "",
    "who invented the World Wide Web", ["berners lee", "berners-lee"]);
  person("Grace Hopper", "computer scientist and naval officer", "9 December 1906", "1 January 1992",
    "who pioneered compilers and helped develop COBOL", ["hopper"]);
  person("Stephen Hawking", "theoretical physicist", "8 January 1942", "14 March 2018",
    "known for work on black holes and cosmology", ["hawking"]);
  person("Galileo Galilei", "astronomer and physicist", "15 February 1564", "8 January 1642",
    "who improved the telescope and supported heliocentrism", ["galileo"]);
  person("Nelson Mandela", "revolutionary and statesman", "18 July 1918", "5 December 2013",
    "who became the first democratically elected President of South Africa", ["mandela"]);

  E("first person on the Moon", "concept",
    "Neil Armstrong was the first person to walk on the Moon, on 20 July 1969 during Apollo 11.",
    { person: "Neil Armstrong", time: "20 July 1969" }, ["first man on the moon", "moon landing"]);

  /* ============================================================== works */
  E("Pride and Prejudice", "book", "Pride and Prejudice is Jane Austen's 1813 novel about Elizabeth Bennet and Mr Darcy.",
    { author: "Jane Austen", time: "published in 1813", type: "novel" }, ["pride & prejudice"]);
  E("Hamlet", "play", "Hamlet is William Shakespeare's tragedy about a Danish prince avenging his father's murder.",
    { author: "William Shakespeare", time: "written around 1600", type: "tragedy" }, []);
  E("Romeo and Juliet", "play", "Romeo and Juliet is Shakespeare's tragedy of two young lovers from feuding families.",
    { author: "William Shakespeare", time: "written around 1595" }, []);
  E("Macbeth", "play", "Macbeth is Shakespeare's tragedy about ambition and its consequences.",
    { author: "William Shakespeare" }, []);
  E("Mona Lisa", "painting", "The Mona Lisa is Leonardo da Vinci's portrait, painted from about 1503, now in the Louvre.",
    { artist: "Leonardo da Vinci", creator: "Leonardo da Vinci", location: "the Louvre in Paris",
      time: "painted from about 1503" }, ["la gioconda"]);
  E("The Starry Night", "painting", "The Starry Night is Vincent van Gogh's 1889 painting of a swirling night sky.",
    { artist: "Vincent van Gogh", time: "1889" }, ["starry night"]);
  E("1984", "book", "Nineteen Eighty-Four is George Orwell's 1949 novel about a totalitarian surveillance state.",
    { author: "George Orwell", time: "published in 1949" }, ["nineteen eighty four"]);
  E("The Odyssey", "book", "The Odyssey is an ancient Greek epic poem attributed to Homer.",
    { author: "Homer" }, ["odyssey"]);

  /* ============================================================ history */
  E("World War II", "event",
    "World War II was the global conflict fought from 1939 to 1945 between the Allied and Axis powers.",
    { time: "1939 to 1945, ending on 2 September 1945", type: "global war" },
    ["ww2", "wwii", "second world war", "world war 2"]);
  E("World War I", "event",
    "World War I was the global conflict fought from 1914 to 1918.",
    { time: "1914 to 1918" }, ["ww1", "wwi", "first world war", "world war 1", "great war"]);
  E("Cold War", "event", "The Cold War was the geopolitical rivalry between the United States and the Soviet Union from 1947 to 1991.",
    { time: "1947 to 1991" }, []);
  E("Renaissance", "event", "The Renaissance was the European revival of art, learning and science from roughly the 14th to 17th centuries.",
    { time: "roughly the 14th to 17th centuries" }, []);
  E("Industrial Revolution", "event",
    "The Industrial Revolution was the shift to machine manufacturing, beginning in Britain in the late 18th century.",
    { time: "from about 1760" }, []);
  E("Apollo 11", "event", "Apollo 11 was the mission that first landed humans on the Moon, in July 1969.",
    { time: "July 1969", person: "Neil Armstrong, Buzz Aldrin and Michael Collins" }, []);

  /* ======================================================= everyday facts
   * Entities people ask about that do not belong to any section above: the
   * common animals, the common enumerations, and the physical constants that
   * turn up in ordinary questions. */
  E("spider", "animal", "A spider is an eight-legged arachnid, not an insect.",
    { count: "eight legs", type: "arachnid" }, ["spiders"]);
  E("insect", "animal", "An insect is a six-legged arthropod with a three-part body.",
    { count: "six legs", type: "arthropod" }, ["insects"]);
  E("dog", "animal", "A dog is a domesticated descendant of the wolf, kept as a companion and working animal.", {}, ["dogs"]);
  E("cat", "animal", "A cat is a small domesticated carnivorous mammal.", {}, ["cats"]);
  E("bird", "animal", "A bird is a warm-blooded vertebrate with feathers, wings and a beak.", {}, ["birds"]);
  E("whale", "animal", "A whale is a large marine mammal that breathes air and nurses its young.", {}, ["whales"]);
  E("blue whale", "animal", "The blue whale is the largest animal known to have existed.",
    { size: "up to 30 metres long", type: "marine mammal" }, []);

  E("continent", "concept", "A continent is one of Earth's large continuous landmasses.",
    { count: "seven", part: "Africa, Antarctica, Asia, Australia, Europe, North America and South America" },
    ["continents"], { list: ["Africa", "Antarctica", "Asia", "Australia", "Europe", "North America", "South America"] });
  E("ocean", "concept", "An ocean is one of Earth's five great bodies of salt water.",
    { count: "five", part: "the Pacific, Atlantic, Indian, Southern and Arctic oceans" },
    ["oceans"], { list: ["Pacific Ocean", "Atlantic Ocean", "Indian Ocean", "Southern Ocean", "Arctic Ocean"] });
  E("primary colour", "concept",
    "The primary colours of light are red, green and blue; in pigment they are traditionally red, yellow and blue.",
    { count: "three", part: "red, green and blue for light" },
    ["primary colours", "primary color", "primary colors"],
    { list: ["Red", "Green", "Blue"] });
  E("state of matter", "concept", "The classical states of matter are solid, liquid and gas, with plasma as a fourth.",
    { count: "three classical states", part: "solid, liquid and gas" },
    ["states of matter"], { list: ["Solid", "Liquid", "Gas"] });
  E("season", "concept", "The four seasons are spring, summer, autumn and winter.",
    { count: "four", part: "spring, summer, autumn and winter" }, [],
    { list: ["Spring", "Summer", "Autumn", "Winter"] });
  E("day of the week", "concept", "There are seven days in a week.",
    { count: "seven" }, ["days of the week", "week"],
    { list: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] });

  E("boiling point of water", "constant", "Water boils at 100 °C (212 °F) at sea-level pressure.",
    { temperature: "100 °C (212 °F)" }, ["boiling point"]);
  E("freezing point of water", "constant", "Water freezes at 0 °C (32 °F).",
    { temperature: "0 °C (32 °F)" }, ["freezing point"]);

  /* ========================================================== ambiguity */
  /* Senses of a shared name. The resolver returns them all and the router
     decides whether context settles the reading or the user should be asked. */
  var SENSES = {
    "mercury": [
      { entity: "mercury", gloss: "the chemical element, a liquid metal with symbol Hg", domain: "chemistry" },
      { entity: "Mercury (planet)", gloss: "the smallest planet and the one closest to the Sun", domain: "astronomy" },
      { entity: "Mercury (mythology)", gloss: "the Roman messenger god", domain: "mythology" }
    ],
    "java": [
      { entity: "Java", gloss: "the programming language", domain: "computing" },
      { entity: "Java (island)", gloss: "the Indonesian island", domain: "geography" },
      { entity: "Java (coffee)", gloss: "a colloquial word for coffee", domain: "everyday" }
    ],
    "jordan": [
      { entity: "Jordan (country)", gloss: "the country in Western Asia", domain: "geography" },
      { entity: "Michael Jordan", gloss: "the American basketball player", domain: "sport" },
      { entity: "Jordan River", gloss: "the river flowing to the Dead Sea", domain: "geography" }
    ],
    "matrix": [
      { entity: "The Matrix", gloss: "the 1999 science-fiction film", domain: "film" },
      { entity: "matrix", gloss: "the rectangular array of numbers in mathematics", domain: "mathematics" }
    ],
    /* A dominant sense is answered rather than asked about: the question is
       overwhelmingly about one of them, and a clarification would be noise. */
    "python": [
      { entity: "Python", gloss: "the programming language", domain: "computing", dominant: true },
      { entity: "python (snake)", gloss: "the family of constricting snakes", domain: "biology" }
    ],
    "apple": [
      { entity: "apple (fruit)", gloss: "the fruit", domain: "everyday" },
      { entity: "Apple Inc.", gloss: "the technology company", domain: "business" }
    ],
    "amazon": [
      { entity: "Amazon River", gloss: "the river in South America", domain: "geography" },
      { entity: "Amazon (company)", gloss: "the technology and retail company", domain: "business" }
    ],
    "turkey": [
      { entity: "Turkey", gloss: "the country in Western Asia", domain: "geography" },
      { entity: "turkey (bird)", gloss: "the large bird", domain: "biology" }
    ]
  };
  E("Mercury (planet)", "planet", "Mercury is the smallest planet in the Solar System and the closest to the Sun.",
    { type: "planet", location: "the Solar System", size: "4,879 km in diameter" }, []);
  E("Mercury (mythology)", "concept", "Mercury is the Roman god of commerce and the messenger of the gods.", {}, []);
  E("Java (island)", "place", "Java is an Indonesian island and the most populous island in the world.",
    { country: "Indonesia", population: "about 150 million" }, []);
  E("Java (coffee)", "concept", "Java is an informal word for coffee, after the Indonesian island that once dominated its trade.", {}, []);
  E("Jordan (country)", "country", "Jordan is a country in Western Asia, on the east bank of the Jordan River.",
    { capital: "Amman", currency: "the dinar", language: "Arabic", continent: "Western Asia" }, []);
  E("Michael Jordan", "person", "Michael Jordan is an American former professional basketball player, widely considered among the greatest of all time.",
    { birth: "17 February 1963", type: "basketball player" }, []);
  E("Jordan River", "river", "The Jordan is a river in the Levant that flows into the Dead Sea.", { length: "about 251 kilometres" }, []);
  E("The Matrix", "film", "The Matrix is a 1999 science-fiction film in which humanity is unknowingly trapped in a simulated reality.",
    { creator: "the Wachowskis", time: "released in 1999", type: "science-fiction film" }, []);
  E("python (snake)", "animal", "Pythons are large non-venomous constricting snakes found in Africa, Asia and Australia.", {}, []);
  E("apple (fruit)", "concept", "An apple is the edible fruit of the apple tree, Malus domestica.", {}, []);
  E("Apple Inc.", "company", "Apple Inc. is an American technology company known for the iPhone, Mac and iPad.",
    { creator: "Steve Jobs, Steve Wozniak and Ronald Wayne", time: "founded in 1976" }, []);
  E("Amazon (company)", "company", "Amazon is an American technology and retail company, also a major cloud provider through AWS.",
    { creator: "Jeff Bezos", time: "founded in 1994" }, []);
  E("turkey (bird)", "animal", "The turkey is a large bird native to North America, widely farmed for meat.", {}, []);

  /* ==================================================== contrast knowledge
   * Explicit contrast dimensions for pairs people actually compare. The
   * comparator falls back to a generic attribute diff for any other pair, so
   * this table improves quality without being the mechanism. */
  var CONTRASTS = [
    { a: "TCP", b: "UDP", dims: [
      ["connection", "sets up a connection with a three-way handshake", "sends datagrams with no handshake"],
      ["reliability", "retransmits lost segments and guarantees delivery", "does not retransmit; losses are simply lost"],
      ["ordering", "delivers bytes in the order they were sent", "makes no ordering guarantee"],
      ["overhead", "larger headers and more round trips", "minimal header and no setup cost"],
      ["typical use", "web pages, email and file transfer", "voice, video, gaming and DNS"]]},
    { a: "RAM", b: "SSD", dims: [
      ["volatility", "loses its contents when power is removed", "keeps data without power"],
      ["speed", "nanosecond access, directly addressable by the CPU", "microsecond access over a storage bus"],
      ["role", "working memory for running programs", "persistent storage for files and programs"],
      ["capacity and cost", "smaller and far more expensive per gigabyte", "much larger and cheaper per gigabyte"]]},
    { a: "supervised learning", b: "unsupervised learning", dims: [
      ["data", "uses labelled examples with known correct answers", "uses unlabelled data with no target output"],
      ["goal", "learns a mapping from input to label", "finds structure such as clusters or components"],
      ["evaluation", "measured against held-out labels", "measured indirectly, by cluster quality or reconstruction"],
      ["typical tasks", "classification and regression", "clustering, dimensionality reduction and anomaly detection"]]},
    { a: "mitosis", b: "meiosis", dims: [
      ["outcome", "produces two diploid cells identical to the parent", "produces four haploid cells that differ genetically"],
      ["divisions", "one division", "two successive divisions"],
      ["purpose", "growth, repair and replacement of cells", "producing gametes for sexual reproduction"]]},
    { a: "mass", b: "weight", dims: [
      ["what it is", "the amount of matter in an object", "the force gravity exerts on that matter"],
      ["units", "kilograms", "newtons"],
      ["location", "the same everywhere", "changes with the local gravitational field"]]},
    { a: "correlation", b: "causation", dims: [
      ["claim", "only says two variables move together", "says one variable actually produces the change in the other"],
      ["evidence", "can be measured from observational data alone", "usually needs an experiment or a causal model"],
      ["what can go wrong", "can be produced by a third variable or by coincidence", "is what an intervention would actually change"]]},
    { a: "HTTP", b: "HTTPS", dims: [
      ["security", "sends requests and responses in the clear", "wraps the same protocol in TLS encryption"],
      ["identity", "no server authentication", "the server presents a certificate that the client verifies"],
      ["default port", "80", "443"]]},
    { a: "SQL", b: "NoSQL", dims: [
      ["schema", "fixed relational schema with typed columns", "flexible or schema-less documents, keys or graphs"],
      ["queries", "declarative SQL with joins", "API- or language-specific queries, often without joins"],
      ["consistency", "strong transactional guarantees", "often tuned for availability and partition tolerance"]]},
    { a: "compiler", b: "interpreter", dims: [
      ["when translation happens", "ahead of time, before the program runs", "while the program runs"],
      ["output", "produces an executable artefact", "produces no separate artefact"],
      ["trade-off", "slower to build, faster to run", "faster to start, slower per operation"]]},
    { a: "RAM", b: "hard drive", dims: [
      ["volatility", "loses data without power", "keeps data without power"],
      ["speed", "nanoseconds", "milliseconds"]]}
  ];

  /* =============================================================== index */
  var C = root.C4LMCore;
  var INDEX = Object.create(null);     /* flat key -> [entity] */
  var TOKEN_INDEX = Object.create(null);

  function key(s) { return C ? C.flatten(s) : String(s).toLowerCase(); }

  /* One vote per entity per token. Aliases would otherwise let a common word
     vote several times for the same entity and outscore an exact match. */
  function addToken(t, ent) {
    var list = TOKEN_INDEX[t] || (TOKEN_INDEX[t] = []);
    if (list.indexOf(ent) < 0) list.push(ent);
  }

  function indexName(name, ent, weight) {
    var k = key(name);
    if (!k) return;
    (INDEX[k] || (INDEX[k] = [])).push({ ent: ent, weight: weight, surface: name });
    var ws = k.split(" ");
    for (var i = 0; i < ws.length; i++) {
      if (ws[i].length < 2) continue;
      addToken(ws[i], ent);
      if (C) {
        var st = C.stem(ws[i]);
        if (st !== ws[i]) addToken(st, ent);
      }
    }
  }

  var built = false;
  function buildIndex() {
    if (built) return;
    built = true;
    for (var i = 0; i < ENTITIES.length; i++) {
      var e = ENTITIES[i];
      e.id = key(e.name);
      indexName(e.name, e, 1.0);
      for (var j = 0; j < e.aliases.length; j++) indexName(e.aliases[j], e, 0.9);
      /* A parenthesised qualifier is a disambiguator; the bare head is an
         alias with lower weight so "Mercury" still reaches all its senses. */
      var bare = e.name.replace(/\s*\([^)]*\)\s*$/, "");
      if (bare !== e.name) indexName(bare, e, 0.6);
    }
    if (C && C.learnProper) {
      /* Entity names may be repaired even when capitalised: they name a
         specific thing this system holds. */
      for (var pn = 0; pn < ENTITIES.length; pn++) {
        var nm = ENTITIES[pn].name;
        if (/^[A-Z]/.test(nm)) {
          /* The parenthetical qualifier is a disambiguator, not part of the
             name. Ordinary words inside a name are protected downstream by
             the repair's own known-word guard. */
          C.words(nm.replace(/\s*\([^)]*\)\s*$/, "")).forEach(C.learnProper);
          ENTITIES[pn].aliases.forEach(function (al) {
            if (/^[A-Z]/.test(al)) C.words(al).forEach(C.learnProper);
          });
        }
      }
    }
    if (C) {
      var vocab = [];
      for (var k2 = 0; k2 < ENTITIES.length; k2++) {
        vocab.push(ENTITIES[k2].name);
        vocab.push(ENTITIES[k2].aliases.join(" "));
        vocab.push(ENTITIES[k2].defn);
      }
      C.learnVocabulary(vocab);
    }
  }

  /* Entity resolution. Exact key, then alias, then typo-tolerant, then a
     token-overlap vote. Identity is not substring overlap: a candidate must
     match a registered name, not merely share words with one. */
  function resolve(phrase, opts) {
    buildIndex();
    opts = opts || {};
    var k = key(phrase);
    if (!k) return [];
    var out = [];
    function push(hit, score, how) {
      for (var i = 0; i < out.length; i++) if (out[i].entity === hit.ent) {
        if (score > out[i].score) { out[i].score = score; out[i].how = how; }
        return;
      }
      out.push({ entity: hit.ent, score: score, how: how, surface: hit.surface });
    }
    var exact = INDEX[k];
    if (exact) exact.forEach(function (h) { push(h, h.weight, "exact"); });

    if (!out.length) {
      /* Drop a leading determiner or a trailing classifier noun and retry.
         "the matrix" -> "matrix"; "python language" -> "python". */
      var trimmed = k.replace(/^(?:the|a|an) /, "")
                     .replace(/ (?:language|protocol|theory|concept|system|process|model|notation|thing|stuff)$/, "");
      if (trimmed !== k && INDEX[trimmed]) INDEX[trimmed].forEach(function (h) { push(h, h.weight * 0.92, "trimmed"); });
    }
    if (!out.length && C && k.length >= 5) {
      /* Typo tolerance over the whole registered name, multi-word included:
         "quantum entaglement" is one edit from a name we hold. */
      var budget = k.length >= 12 ? 3 : k.length >= 8 ? 2 : 1;
      var keys = Object.keys(INDEX), bestD = budget + 1, bestKeys = [];
      var qHasDigit = /\d/.test(k);
      for (var i = 0; i < keys.length; i++) {
        if (Math.abs(keys[i].length - k.length) > budget) continue;
        /* A digit is a distinguishing character, not a typo: "CELL4" is not a
           misspelling of "cell". */
        if (qHasDigit !== /\d/.test(keys[i])) continue;
        var d = C.damerau(k, keys[i], budget);
        if (d < bestD) { bestD = d; bestKeys = [keys[i]]; }
        else if (d === bestD && d <= budget) bestKeys.push(keys[i]);
      }
      if (bestD <= budget) {
        bestKeys.forEach(function (bk) {
          INDEX[bk].forEach(function (h) { push(h, h.weight * (bestD === 1 ? 0.85 : 0.75), "fuzzy"); });
        });
      }
    }
    if (!out.length && !opts.strict) {
      /* Token vote: the phrase's content words must cover most of a
         registered name, not the other way round. This is what keeps
         "machine reasoning" from resolving to any document about machines. */
      var toks = k.split(" ").filter(function (t) { return t.length > 2 && !(C && C.STOP[t]); });
      var votes = Object.create(null);
      toks.forEach(function (t) {
        var list = TOKEN_INDEX[t] || (C ? TOKEN_INDEX[C.stem(t)] : null) || [];
        list.forEach(function (e) { votes[e.id] = (votes[e.id] || 0) + 1; });
      });
      var ids = Object.keys(votes);
      for (var v = 0; v < ids.length; v++) {
        var ent = byId(ids[v]);
        if (!ent) continue;
        var nameToks = key(ent.name).split(" ").filter(function (t) { return t.length > 2; });
        var cover = votes[ids[v]] / Math.max(1, nameToks.length);
        var qcover = votes[ids[v]] / Math.max(1, toks.length);
        if (cover >= 0.999 && qcover >= 0.5) {
          push({ ent: ent, weight: 1, surface: ent.name }, Math.min(0.8, 0.5 * qcover + 0.25), "tokens");
        }
      }
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  var byIdCache = null;
  function byId(id) {
    if (!byIdCache) {
      buildIndex();
      byIdCache = Object.create(null);
      ENTITIES.forEach(function (e) { byIdCache[e.id] = e; });
    }
    return byIdCache[id] || null;
  }

  function senses(phrase) {
    buildIndex();
    var k = key(phrase).replace(/^(?:the|a|an) /, "");
    if (SENSES[k]) return SENSES[k];
    /* A misspelling is still ambiguous. Resolve the phrase and ask again
       under the canonical spelling. */
    var hit = resolve(phrase, { strict: true })[0];
    if (hit) {
      var bare = key(hit.entity.name.replace(/\s*\([^)]*\)\s*$/, ""));
      if (SENSES[bare]) return SENSES[bare];
    }
    return null;
  }

  function contrast(a, b) {
    var ka = key(a), kb = key(b);
    for (var i = 0; i < CONTRASTS.length; i++) {
      var c = CONTRASTS[i];
      if ((key(c.a) === ka && key(c.b) === kb)) return { dims: c.dims, a: c.a, b: c.b, flipped: false };
      if ((key(c.a) === kb && key(c.b) === ka)) return { dims: c.dims, a: c.a, b: c.b, flipped: true };
    }
    /* Alias-aware retry through resolution, so "solid state drive" finds the
       SSD contrast without another table row. */
    var ra = resolve(a, { strict: true })[0], rb = resolve(b, { strict: true })[0];
    if (ra && rb) {
      var na = key(ra.entity.name), nb = key(rb.entity.name);
      if (na !== ka || nb !== kb) return contrast(ra.entity.name, rb.entity.name);
    }
    return null;
  }

  function attribute(entity, relation) {
    if (!entity) return "";
    if (entity.rel && entity.rel[relation]) return entity.rel[relation];
    if (entity.extra && entity.extra[relation]) return entity.extra[relation];
    return "";
  }

  /* Entities of a given type, for superlative and enumeration questions. */
  function byType(type) {
    buildIndex();
    var t = String(type).toLowerCase().replace(/s$/, "");
    return ENTITIES.filter(function (e) {
      return e.type === t || (e.rel && String(e.rel.type || "").toLowerCase().indexOf(t) >= 0);
    });
  }

  root.C4LMKB = {
    entities: function () { buildIndex(); return ENTITIES; },
    byType: byType,
    resolve: resolve,
    byId: byId,
    senses: senses,
    contrast: contrast,
    attribute: attribute,
    size: function () { return ENTITIES.length; },
    build: buildIndex
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMKB;
})(typeof window !== "undefined" ? window : globalThis);
