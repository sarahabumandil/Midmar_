"""
Script to create training_columns.pkl from the original training data
This should be run with a sample of the original dataset to extract column names

Usage:
1. Load your original training DataFrame (new_player_raw after one-hot encoding)
2. Run: X_columns = new_player_raw.drop(['Market Value Euros'], axis=1)
3. Save the columns to training_columns.pkl

Example:
    import pandas as pd
    import pickle
    
    # Load your training data (after one-hot encoding)
    # new_player_raw = pd.read_csv('your_training_data.csv')
    # Or recreate from your original data:
    # new_player_raw = pd.get_dummies(player_raw, columns=['Nation','Pos','Squad', 'Comp'])
    
    # Extract feature columns
    X_columns = new_player_raw.drop(['Market Value Euros'], axis=1)
    
    # Save columns
    with open('models/training_columns.pkl', 'wb') as f:
        pickle.dump(X_columns.columns.tolist(), f)
    
    print(f"Saved {len(X_columns.columns)} columns to training_columns.pkl")
"""

print("""
To create training_columns.pkl:

1. Load your original training dataset (the one used to train the model)
2. Apply the same preprocessing:
   - Drop 'Market Value Euros' column
   - Apply one-hot encoding to ['Nation', 'Pos', 'Squad', 'Comp']
3. Extract column names and save them

Example code:
    import pandas as pd
    import pickle
    import os
    
    # Load your training data
    # (Replace with your actual data loading code)
    # player_raw = pd.read_csv('your_data.csv')
    # new_player_raw = pd.get_dummies(player_raw, columns=['Nation','Pos','Squad', 'Comp'])
    
    # Extract feature columns (without target)
    X_columns = new_player_raw.drop(['Market Value Euros'], axis=1)
    
    # Save to models directory
    os.makedirs('models', exist_ok=True)
    with open('models/training_columns.pkl', 'wb') as f:
        pickle.dump(X_columns.columns.tolist(), f)
    
    print(f"✅ Saved {len(X_columns.columns)} columns to models/training_columns.pkl")
    print(f"   First 10 columns: {X_columns.columns.tolist()[:10]}")
    print(f"   Last 10 columns: {X_columns.columns.tolist()[-10:]}")
""")
