import React from 'react';

const BuyerSearch = ({ activeTab, categoryOptions, isFarmer, searchText, selectedCategory, setSearchText, setSelectedCategory }) => (
  (
    !isFarmer &&
      activeTab === 'browse' && (

        <section className="search-bar">

          <input
            type="text"
            placeholder="Search crops..."
            value={searchText}
            onChange={(event) =>
              setSearchText(event.target.value)
            }
          />

          <select
            value={selectedCategory}
            onChange={(event) =>
              setSelectedCategory(event.target.value)
            }
          >

            {categoryOptions.map((option) => (
              <option
                key={option}
                value={option}
              >
                {option}
              </option>
            ))}

          </select>

        </section>

      )
  ) || null
);

export default BuyerSearch;
